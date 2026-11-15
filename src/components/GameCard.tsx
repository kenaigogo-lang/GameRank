import { memo } from 'react';
import { Game } from '../types';

interface GameCardProps {
  game: Game;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
}

export const normalizeScore = (score: number) => (score > 10 ? score / 10 : score);
export const formatScore = (score: number) => (Number.isInteger(score) ? String(score) : score.toFixed(1));
/** 四段分數級距：9 / 7.5 / 6 */
export const scoreTier = (score: number) => {
  const s = normalizeScore(score);
  return s >= 9 ? 's' : s >= 7.5 ? 'a' : s >= 6 ? 'b' : 'c';
};

// 10 分換成 5 顆星，可出現半顆
const Stars = ({ score }: { score: number }) => {
  const n = normalizeScore(score) / 2;
  return (
    <div className="gstars" role="img" aria-label={`${formatScore(score)} 分`}>
      {[1, 2, 3, 4, 5].map(i => (
        <i key={i} className={`nes-icon is-small star${n >= i ? '' : n >= i - 0.5 ? ' is-half' : ' is-transparent'}`} />
      ))}
    </div>
  );
};

// memo：開關視窗或其他卡片變動時，沒變的卡片不重繪（封面是 base64，重繪成本高）
export const GameCard = memo(function GameCard({ game, onDelete, onEdit }: GameCardProps) {
  const genres = game.genre ? game.genre.split(', ').filter(Boolean) : [];

  return (
    <article className="nes-container is-rounded gcard">
      {game.imageUrl ? (
        <img className="gcover" src={game.imageUrl} alt="" loading="lazy" decoding="async" />
      ) : (
        <div className="gcover none" aria-hidden="true">NO<br />IMAGE</div>
      )}
      <div className="gbody">
        <div className="ghead">
          <h3>{game.title}</h3>
          <span className={`gscore t-${scoreTier(game.score)}`}>{formatScore(game.score)}</span>
        </div>
        <Stars score={game.score} />
        <p className="gmeta">
          <b className={`p-${game.platform}`}>{game.platform}</b>
          {genres.length > 0 && <span>{genres.join('／')}</span>}
          <span>{game.ratingDate}{game.playtime ? ` ・ ${game.playtime}H` : ''}</span>
        </p>
        {game.comment && <p className="gcomment" title={game.comment}>{game.comment}</p>}
        <div className="gact">
          <button type="button" className="nes-btn sm" onClick={() => onEdit(game.id)}>編輯</button>
          <button type="button" className="nes-btn is-error sm" onClick={() => onDelete(game.id)}>刪除</button>
        </div>
      </div>
    </article>
  );
});
