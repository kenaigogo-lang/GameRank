import React from 'react';
import { Game, Platform } from '../types';
import { Gamepad2, Tv, Monitor, Trash2, Calendar, Pencil, Clock } from 'lucide-react';

interface GameCardProps {
  game: Game;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
}

const PlatformIcon = ({ platform }: { platform: Platform }) => {
  switch (platform) {
    case Platform.PS:
      return <Gamepad2 className="w-4 h-4 text-blue-400" />;
    case Platform.XBOX:
      return <Gamepad2 className="w-4 h-4 text-[#107C10]" />;
    case Platform.SWITCH:
      return <Tv className="w-4 h-4 text-red-500" />;
    case Platform.PC:
      return <Monitor className="w-4 h-4 text-gray-300" />;
    default:
      return <Gamepad2 className="w-4 h-4" />;
  }
};

const getScoreColor = (score: number) => {
  const normalizedScore = score > 10 ? score / 10 : score;

  if (normalizedScore >= 9.0) return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
  if (normalizedScore >= 7.5) return 'text-blue-400 border-blue-500/30 bg-blue-500/10';
  if (normalizedScore >= 6.0) return 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10';
  return 'text-red-400 border-red-500/30 bg-red-500/10';
};

export const GameCard: React.FC<GameCardProps> = ({ game, onDelete, onEdit }) => {
  const scoreStyle = getScoreColor(game.score);
  const genres = game.genre ? game.genre.split(', ').filter(Boolean) : [];

  return (
    <div className="group relative bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-4 hover:border-slate-600 transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-slate-900/50 flex gap-4">
      <div className="flex-shrink-0">
        {game.imageUrl ? (
          <img 
            src={game.imageUrl} 
            alt={game.title} 
            className="w-20 h-28 object-cover rounded-lg shadow-md bg-slate-900"
            onError={(e) => {
               (e.target as HTMLImageElement).src = 'https://placehold.co/80x112?text=Game';
            }}
          />
        ) : (
          <div className="w-20 h-28 bg-slate-800 rounded-lg flex items-center justify-center border border-slate-700">
            <Gamepad2 className="w-8 h-8 text-slate-600" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start mb-1 pr-16">
          <div>
            <h3 className="text-lg font-bold text-white leading-tight truncate w-full" title={game.title}>
              {game.title}
            </h3>
            <div className="flex items-center gap-2 mt-2">
              <span className={`inline-flex items-center justify-center p-1 rounded bg-slate-800 border border-slate-700`}>
                <PlatformIcon platform={game.platform} />
              </span>
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                {game.platform}
              </span>
            </div>
          </div>
          
          <div className={`flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full border-2 font-bold text-lg ml-2 ${scoreStyle}`}>
            {game.score}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-slate-500 mb-2">
           {game.ratingDate && (
             <div className="flex items-center gap-1 text-[10px] sm:text-xs" title="Rating Date">
               <Calendar className="w-3 h-3 text-white" />
               <span>{game.ratingDate}</span>
             </div>
           )}
           {game.playtime !== undefined && game.playtime > 0 && (
             <div className="flex items-center gap-1 text-[10px] sm:text-xs text-slate-400" title="Playtime">
               <Clock className="w-3 h-3" />
               <span>{game.playtime}h</span>
             </div>
           )}
           <div className="flex flex-wrap gap-1">
             {genres.map(g => (
               <span key={g} className="truncate border border-slate-700 px-1.5 py-0.5 rounded bg-slate-900/50 text-[10px]">
                 {g}
               </span>
             ))}
           </div>
        </div>

        <div className="relative p-2.5 bg-slate-900/50 rounded-lg border border-slate-800">
          <p className="text-sm text-slate-300 italic leading-relaxed line-clamp-2" title={game.comment}>
            "{game.comment}"
          </p>
        </div>
      </div>

      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all z-10">
        <button 
          onClick={() => onEdit(game.id)}
          className="p-1.5 bg-slate-800 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded-lg border border-slate-700 shadow-sm"
          title="Edit Rating"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button 
          onClick={() => onDelete(game.id)}
          className="p-1.5 bg-slate-800 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg border border-slate-700 shadow-sm"
          title="Delete Rating"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};