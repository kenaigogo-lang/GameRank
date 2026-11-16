import { GameRow } from '../components/GameRow';
import { SortOption } from '../types';
import { ViewProps, emptyState, scopeLabel, userLabel } from './types';

export const ArcadeView = (p: ViewProps) => {
  const empty = emptyState(p);
  return (
    <div className="crt">
      <header className="top">
        <div className="util">
          <span>{userLabel(p.user)}</span>
          <div className="util-btns">
            <button type="button" className="link" onClick={p.onToggleTheme}>切換紅白機風格</button>
            <button type="button" className="link" onClick={p.onExport}>匯出 JSON</button>
            <button type="button" className="link" onClick={p.onImport}>匯入 JSON</button>
            {p.user && <button type="button" className="link" onClick={p.onCloudBackup}>雲端備份</button>}
            {p.user && <button type="button" className="link" onClick={p.onCloudRestore}>雲端還原</button>}
            {p.user
              ? <button type="button" className="link danger" onClick={p.onLogout}>登出</button>
              : <button type="button" className="link" onClick={p.onLogin}>Google 登入</button>}
          </div>
        </div>

        <h1 className="marquee">GAMERANK</h1>
        <p className="sub">— 我的遊戲排行榜 —</p>
        <dl className="stats" aria-label={scopeLabel(p.activeTab)}>
          <div><dt>遊戲總數</dt><dd className="c2">{p.stats.total}<small>款</small></dd></div>
          <div><dt>平均分數</dt><dd className="c0">{p.stats.avgScore}<small>/ 10</small></dd></div>
          <div><dt>遊戲總時數</dt><dd className="c3">{p.stats.totalPlaytime}<small>小時</small></dd></div>
        </dl>
        <p className="scope">{scopeLabel(p.activeTab)}</p>
        <button type="button" className="coin" data-add onClick={p.onAdd}>
          <i>INSERT COIN</i>＋ 新增遊戲
        </button>
        <p className={`sync${p.isSaving ? ' busy' : ''}`} role="status" aria-live="polite">{p.isSaving ? 'NOW SAVING...' : ''}</p>
      </header>

      <main className="wrap">
        {p.notice && <section className="notice-bar">{p.notice}</section>}
        <div className="sel" role="tablist" aria-label="平台">
          <span className="lb">SELECT</span>
          {p.tabs.map(tab => (
            <button key={tab} type="button" role="tab" aria-selected={p.activeTab === tab} className={p.activeTab === tab ? 'on' : ''} onClick={() => p.onSelectTab(tab)}>
              {tab === 'ALL' ? '全部' : tab}
              <small>{p.tabCounts[tab]}</small>
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
          <select data-sort value={p.sortOption} onChange={(e) => p.onSort(e.target.value as SortOption)} aria-label="排序方式">
            {p.sortLabels.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>

        <div className="board">
          <div className="row hd" aria-hidden="true">
            <span className="rk">RANK</span>
            <span className="sc">SCORE</span>
            <span />
            <span className="nm">NAME</span>
            <span className="pl">SYS</span>
            <span className="gn hs">GENRE</span>
            <span className="hr hs">TIME</span>
            <span className="dt hs">DATE</span>
            <span className="ac" />
          </div>

          {p.isLoading ? (
            <div className="state">
              <h3>LOADING...</h3>
              <p>正在讀取你的遊戲清單</p>
            </div>
          ) : p.games.length === 0 ? (
            <div className="state">
              <h3>{empty.title}</h3>
              <p>{empty.text}</p>
              {!p.user && <button type="button" className="btn cy" onClick={p.onLogin}>Google 登入</button>}
              {p.user && !p.hasGames && !p.loadFailed && <button type="button" className="btn yl" onClick={p.onAdd}>＋ 新增第一款遊戲</button>}
            </div>
          ) : (
            <ol>
              {p.games.map((game, index) => <GameRow key={game.id} game={game} rank={index} onDelete={p.onDelete} onEdit={p.onEdit} />)}
            </ol>
          )}
        </div>

        <p className="foot">© GAMERANK　CREDIT 01　v{p.version}</p>
      </main>
    </div>
  );
};
