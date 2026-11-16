import { memo } from 'react';
import { Game } from '../types';

interface GameRowProps {
  game: Game;
  rank: number;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
}

const ORDINALS = ['1ST', '2ND', '3RD'];

export const formatScore = (score: number) => (Number.isInteger(score) ? String(score) : score.toFixed(1));

// memo：開關視窗或其他列變動時，沒變的列不重繪（封面是 base64，重繪成本高）
export const GameRow = memo(function GameRow({ game, rank, onDelete, onEdit }: GameRowProps) {
  const genres = game.genre ? game.genre.split(', ').filter(Boolean) : [];

  return (
    <li className={`row c${rank % 6}`}>
      <span className="rk">{ORDINALS[rank] ?? `${rank + 1}TH`}</span>
      <span className="sc">{formatScore(game.score)}</span>
      {game.imageUrl ? (
        <img className="cv" src={game.imageUrl} alt="" loading="lazy" decoding="async" />
      ) : (
        <span className="cv none" aria-hidden="true" />
      )}
      <span className="nm">
        <b>{game.title}</b>
        {game.comment && <small title={game.comment}>{game.comment}</small>}
      </span>
      <span className="pl">{game.platform}</span>
      <span className="gn hs">{genres.join('/')}</span>
      <span className="hr hs">{game.playtime ? `${game.playtime}H` : '—'}</span>
      <span className="dt hs">{game.ratingDate}</span>
      <span className="ac">
        <button type="button" className="link" onClick={() => onEdit(game.id)}>編輯</button>
        <button type="button" className="link danger" onClick={() => onDelete(game.id)}>刪除</button>
      </span>
    </li>
  );
});
