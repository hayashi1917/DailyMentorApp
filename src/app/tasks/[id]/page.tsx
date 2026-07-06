import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Task } from "@/lib/types";
import AppShell from "@/components/AppShell";
import TaskForm from "@/components/TaskForm";
import TaskBreakdown from "@/components/TaskBreakdown";

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: task }, { data: subtasks }] = await Promise.all([
    supabase.from("tasks").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("tasks")
      .select("*")
      .eq("parent_task_id", id)
      .neq("status", "archived")
      .order("created_at", { ascending: true }),
  ]);

  if (!task) notFound();

  return (
    <AppShell title="タスクを編集">
      <div className="mt-2">
        <TaskForm task={task as Task} />
        <TaskBreakdown
          task={task as Task}
          subtasks={(subtasks ?? []) as Task[]}
        />
      </div>
    </AppShell>
  );
}
