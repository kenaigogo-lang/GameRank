import { GameCard } from '../components/GameCard';
import { SortOption } from '../types';
import { ViewProps, emptyState, scopeLabel, userLabel } from './types';

export const NesView = (p: ViewProps) => {
  const empty = emptyState(p);
  return (
    <div className="app">
      <header className="nav">
        <div className="navin">
          <div className="brand">
            <i className="nes-icon trophy is-small" aria-hidden="true" />
            <h1>GAMERANK</h1>
          </div>
          <div className="navact">
            <span className="who">{userLabel(p.user)}</span>
            <button type="button" className="nes-btn sm" onClick={p.onToggleTheme}>切換街機風格</button>
            <button type="button" className="nes-btn sm" onClick={p.onExport}>匯出</button>
            <button type="button" className="nes-btn sm" onClick={p.onImport}>匯入</button>
            {p.user && <button type="button" className="nes-btn sm" onClick={p.onCloudBackup}>雲端備份</button>}
            {p.user && <button type="button" className="nes-btn sm" onClick={p.onCloudRestore}>雲端還原</button>}
            {p.user
              ? <button type="button" className="nes-btn is-error sm" onClick={p.onLogout}>登出</button>
              : <button type="button" className="nes-btn is-warning sm" onClick={p.onLogin}>Google 登入</button>}
            <button type="button" className="nes-btn is-primary sm" data-add onClick={p.onAdd}>＋ 新增遊戲</button>
          </div>
        </div>
      </header>

      <main className="wrap">
        <section className="nes-container with-title is-rounded sts">
          <p className="title">PLAYER STATUS</p>
          <dl className="stg" aria-label={scopeLabel(p.activeTab)}>
            <div><dt>遊戲總數</dt><dd>{p.stats.total}<small>款</small></dd></div>
            <div><dt>平均分數</dt><dd className="nes-text is-primary">{p.stats.avgScore}<small>/10</small></dd></div>
            <div><dt>遊戲總時數</dt><dd className="nes-text is-success">{p.stats.totalPlaytime}<small>小時</small></dd></div>
          </dl>
          <progress className="nes-progress is-primary" value={Number(p.stats.avgScore)} max={10} aria-label="平均分數" />
          <p className="scope">
            <span>{scopeLabel(p.activeTab)}</span>
            <span className={`sync${p.isSaving ? ' busy' : ''}`} role="status" aria-live="polite">{p.isSaving ? 'NOW SAVING...' : ''}</span>
          </p>
        </section>

        <div className="ptabs" role="tablist" aria-label="平台">
          {p.tabs.map(tab => (
            <button key={tab} type="button" role="tab" aria-selected={p.activeTab === tab} className={`nes-btn sm${p.activeTab === tab ? ' is-primary' : ''}`} onClick={() => p.onSelectTab(tab)}>
              {tab === 'ALL' ? '全部' : tab} {p.tabCounts[tab]}
            </button>
          ))}
        </div>

        <div className="bar">
          <div className="chips">
            <button type="button" className={`chip${p.activeGenre === 'ALL' ? ' on' : ''}`} onClick={() => p.onSelectGenre('ALL')}>全部類型</button>
            {p.genres.map(g => (
              <button key={g} type="button" className={`chip${p.activeGenre === g ? ' on' : ''}`} onClick={() => p.onSelectGenre(g)}>{g}</button>
            ))}
          </div>
          <div className="nes-select srt">
            <select data-sort value={p.sortOption} onChange={(e) => p.onSort(e.target.value as SortOption)} aria-label="排序方式">
              {p.sortLabels.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </div>

        {p.isLoading ? (
          <div className="nes-container is-rounded state">
            <h3>LOADING...</h3>
            <p>正在讀取你的遊戲清單</p>
          </div>
        ) : p.games.length === 0 ? (
          <div className="nes-container is-rounded state">
            <h3>{empty.title}</h3>
            <p>{empty.text}</p>
            {!p.user && <button type="button" className="nes-btn is-warning" onClick={p.onLogin}>Google 登入</button>}
            {p.user && !p.hasGames && <button type="button" className="nes-btn is-primary" onClick={p.onAdd}>＋ 新增第一款遊戲</button>}
          </div>
        ) : (
          <div className="grid">
            {p.games.map(game => <GameCard key={game.id} game={game} onDelete={p.onDelete} onEdit={p.onEdit} />)}
          </div>
        )}

        <p className="foot">GAMERANK v{p.version}</p>
      </main>
    </div>
  );
};
