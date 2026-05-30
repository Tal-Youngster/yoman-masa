import type { Task } from '@/domain/task';
import { TaskRow } from './TaskRow';
import { QuickAddTask } from './QuickAddTask';
import type { QuickAddParse } from '../quick-parse';

export interface TasksListProps {
  tasks: Task[];
  today: string;
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onQuickAdd?: (parsed: QuickAddParse) => Promise<void>;
}

function isComplete(t: Task): boolean {
  return t.status === 'done' || t.status === 'cancelled';
}

export function TasksList({ tasks, today, onToggle, onEdit, onDelete, onQuickAdd }: TasksListProps): React.JSX.Element {
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-on-surface-variant">No tasks yet.</p>
        {onQuickAdd && <QuickAddTask onAdd={onQuickAdd} />}
      </div>
    );
  }

  const overdue: Task[] = [];
  const todayTasks: Task[] = [];
  const upcoming: Task[] = [];
  const noDate: Task[] = [];
  const completed: Task[] = [];

  for (const t of tasks) {
    if (isComplete(t)) {
      completed.push(t);
      continue;
    }
    if (!t.due_date) {
      noDate.push(t);
    } else if (t.due_date < today) {
      overdue.push(t);
    } else if (t.due_date === today) {
      todayTasks.push(t);
    } else {
      upcoming.push(t);
    }
  }

  // Sort logic could be added here (e.g. by priority, then by due_date)

  const renderSection = (title: string, list: Task[], titleColor: string = "text-on-surface") => {
    if (list.length === 0) return null;
    return (
      <div className="mb-6 flex flex-col gap-1">
        <h3 className={`text-sm font-bold ${titleColor} mb-2`}>{title}</h3>
        <div className="flex flex-col">
          {list.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              today={today}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col">
      {renderSection('Overdue', overdue, 'text-red-500')}
      {renderSection('Today', todayTasks, 'text-green-600')}
      {renderSection('Upcoming', upcoming)}
      {renderSection('No Date', noDate)}
      
      {onQuickAdd && (
        <div className="mt-2 mb-6">
          <QuickAddTask onAdd={onQuickAdd} />
        </div>
      )}

      {renderSection('Completed', completed, 'text-on-surface-variant')}
    </div>
  );
}
