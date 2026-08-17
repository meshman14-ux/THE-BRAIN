import { redirect } from "next/navigation";

export default function Root() {
  // The front door is the DAY, not the dashboard.
  //
  // A dashboard answers "how are things?" — a question you ask sometimes. The
  // day answers "what am I doing next?", which is the question every morning
  // actually starts with. The dashboard is still one tap away and unchanged;
  // it stops being the thing you must pass through to reach today's work.
  //
  // MODE_HOME is deliberately NOT changed: selecting a system still lands on
  // that system's dashboard, because that IS a "how are things" question and
  // /day is not scoped to a system.
  redirect("/day");
}
