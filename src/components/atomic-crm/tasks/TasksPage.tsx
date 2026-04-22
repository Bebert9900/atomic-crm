import { TasksListContent } from "./TasksListContent";

export const TasksPage = () => {
  return (
    <div className="max-w-2xl">
      <TasksListContent />
    </div>
  );
};

TasksPage.path = "/tasks";
