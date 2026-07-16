// Front-end chat: keeps the conversation in memory, streams Ledger's reply
// from /api/chat and types it into the thread.

const thread = document.getElementById("thread");
const form = document.getElementById("composer");
const input = document.getElementById("input");
const send = document.getElementById("send");
const reset = document.getElementById("reset");

/** @type {{role: "user"|"assistant", content: string}[]} */
let history = [];

function addBubble(who, text) {
  const msg = document.createElement("div");
  msg.className = `msg ${who}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  msg.appendChild(bubble);
  thread.appendChild(msg);
  thread.scrollTop = thread.scrollHeight;
  return bubble;
}

async function ask(text) {
  history.push({ role: "user", content: text });
  addBubble("you", text);

  const bubble = addBubble("ledger", "");
  const cursor = document.createElement("span");
  cursor.className = "cursor";
  bubble.appendChild(cursor);

  let reply = "";
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history }),
    });
    if (!res.ok || !res.body) throw new Error("bad response");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Parse complete SSE events (separated by a blank line).
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";
      for (const evt of events) {
        for (const line of evt.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            const data = JSON.parse(payload);
            if (data.text) {
              reply += data.text;
              bubble.textContent = reply;
              bubble.appendChild(cursor);
              thread.scrollTop = thread.scrollHeight;
            }
          } catch { /* ignore keep-alives */ }
        }
      }
    }
  } catch {
    reply = reply || "Line dropped, love. Check the connection and try again.";
    bubble.textContent = reply;
  }

  cursor.remove();
  if (reply) history.push({ role: "assistant", content: reply });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  send.disabled = true;
  input.disabled = true;
  await ask(text);
  send.disabled = false;
  input.disabled = false;
  input.focus();
});

reset.addEventListener("click", () => {
  history = [];
  thread.innerHTML = "";
  addBubble("ledger", "Clean slate. What are we working on, love?");
  input.focus();
});
