import AppShell from "@/components/AppShell";
import TaskForm from "@/components/TaskForm";

export default function NewTaskPage() {
  return (
    <AppShell title="タスクを作成">
      <div className="mt-2">
        <TaskForm />
      </div>
    </AppShell>
  );
}
