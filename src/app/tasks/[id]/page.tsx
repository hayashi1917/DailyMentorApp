import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Task } from "@/lib/types";
import AppShell from "@/components/AppShell";
import TaskForm from "@/components/TaskForm";

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

  const { data: task } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!task) notFound();

  return (
    <AppShell title="タスクを編集">
      <div className="mt-2">
        <TaskForm task={task as Task} />
      </div>
    </AppShell>
  );
}
