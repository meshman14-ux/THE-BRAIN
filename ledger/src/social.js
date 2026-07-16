// Ledger the influencer — generate social posts in her voice.
//
//   npm run social                       # a general drop
//   npm run social -- "loyalty"          # posts on a theme
//   npm run social -- "burnout" 5        # N posts on a theme
//
// Uses structured outputs so every post comes back typed and ready to schedule.

import { client, MODEL, SYSTEM_PROMPT } from "./persona.js";

const theme = process.argv[2] || "mindset, patience, and playing the long game";
const count = Math.min(Math.max(parseInt(process.argv[3] || "4", 10) || 4, 1), 8);

const schema = {
  type: "object",
  properties: {
    posts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          platform: { type: "string", enum: ["x", "instagram", "linkedin"] },
          hook: { type: "string", description: "The scroll-stopping first line." },
          body: { type: "string", description: "The post itself, in Agatha's voice." },
          hashtags: { type: "array", items: { type: "string" } },
        },
        required: ["platform", "hook", "body", "hashtags"],
        additionalProperties: false,
      },
    },
  },
  required: ["posts"],
  additionalProperties: false,
};

const instruction =
  `Write ${count} social media posts on the theme: "${theme}".\n` +
  `Mix the platforms (x = short and punchy, instagram = caption with a little more room, ` +
  `linkedin = a sharp lesson framed for professionals). Stay fully in character as Agatha — ` +
  `weighted lines, cold-warm menace, tough love, the long game. Keep hashtags few and real, never spammy.`;

const res = await client.messages.create({
  model: MODEL,
  max_tokens: 2048,
  system: SYSTEM_PROMPT,
  messages: [{ role: "user", content: instruction }],
  output_config: { format: { type: "json_schema", schema } },
});

const textBlock = res.content.find((b) => b.type === "text");
const { posts } = JSON.parse(textBlock.text);

const label = { x: "𝕏 / Twitter", instagram: "Instagram", linkedin: "LinkedIn" };
for (const p of posts) {
  console.log(`\n── ${label[p.platform] || p.platform} ──`);
  console.log(p.hook);
  console.log(p.body);
  if (p.hashtags?.length) console.log(p.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" "));
}
console.log();
