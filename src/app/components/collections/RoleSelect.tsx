import { Eye, Edit, ShieldAlert, Check } from 'lucide-react';
import { type CollectionRole } from '../../firestore/collections';

interface RoleSelectProps {
  value: Exclude<CollectionRole, 'owner'>;
  onChange: (role: Exclude<CollectionRole, 'owner'>) => void;
}

export function RoleSelect({ value, onChange }: RoleSelectProps) {
  const roles: {
    id: Exclude<CollectionRole, 'owner'>;
    title: string;
    desc: string;
    icon: React.ReactNode;
    color: string;
    activeBorder: string;
  }[] = [
    {
      id: 'viewer',
      title: 'Viewer',
      desc: 'Can view and copy passwords only. Cannot modify items or invite others.',
      icon: <Eye className="w-4 h-4" />,
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
      activeBorder: 'border-emerald-500 ring-emerald-500/20 bg-emerald-500/5',
    },
    {
      id: 'editor',
      title: 'Collaborator',
      desc: 'Can add, edit, and delete contents. Cannot manage members or invites.',
      icon: <Edit className="w-4 h-4" />,
      color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/25',
      activeBorder: 'border-cyan-500 ring-cyan-500/20 bg-cyan-500/5',
    },
    {
      id: 'manager',
      title: 'Manager',
      desc: 'Can edit passwords and manage member roles/invites. Cannot delete the collection.',
      icon: <ShieldAlert className="w-4 h-4" />,
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
      activeBorder: 'border-amber-500 ring-amber-500/20 bg-amber-500/5',
    },
  ];

  return (
    <div className="flex flex-col gap-2 w-full">
      <label className="text-gray-400 text-xs font-semibold mb-0.5">
        Select Collaboration Role
      </label>
      
      <div className="flex flex-col gap-2">
        {roles.map((r) => {
          const isSelected = value === r.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onChange(r.id)}
              className={`flex items-start gap-3 p-3.5 rounded-2xl border text-left transition-all relative ${
                isSelected
                  ? `border-cyan-500/60 bg-cyan-500/5 ring-1 ring-cyan-500/30`
                  : 'border-white/5 bg-[#16213e] hover:border-white/10 hover:bg-[#16213e]/70'
              }`}
            >
              {/* Role icon */}
              <div className={`p-2 rounded-lg shrink-0 ${r.color}`}>
                {r.icon}
              </div>

              {/* Title & Desc */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-white text-xs font-bold">{r.title}</p>
                  {isSelected && (
                    <span className="w-4 h-4 rounded-full bg-cyan-500 text-white flex items-center justify-center">
                      <Check className="w-2.5 h-2.5" />
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-gray-400 mt-1 leading-normal">
                  {r.desc}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
