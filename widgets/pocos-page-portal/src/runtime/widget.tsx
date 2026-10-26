import { React, type AllWidgetProps } from 'jimu-core'
import './style.css'
import {
  condicaoSlices,
  estadoSlices,
  fold,
  formatDate,
  formatMetros,
  formatNumber,
  formatVazao,
  rankMunicipios,
  rankValue,
  sqlEscape,
  titleCase,
  topPocos,
  uniqueSorted,
  yearCounts,
  type Poco,
  type RankMetric,
  type Slice
} from './data'
import { usePocosWebMap } from './webmap'

const PORTAL_SITE_URL = 'https://portaldaagua.sihs.ba.gov.br/'
const PAGE_SIZE = 18

const Widget = (props: AllWidgetProps<any>) => {
  const mapNodeRef = React.useRef<HTMLDivElement>(null)
  const [municipio, setMunicipio] = React.useState('Todos')
  const [condicao, setCondicao] = React.useState('Todos')
  const [estado, setEstado] = React.useState('Todos')
  const [busca, setBusca] = React.useState('')
  const [dateFrom, setDateFrom] = React.useState('')
  const [dateTo, setDateTo] = React.useState('')
  const [selectedId, setSelectedId] = React.useState<number | null>(null)
  const [page, setPage] = React.useState(1)
  const [view, setView] = React.useState<'painel' | 'listagem' | 'ranking'>('painel')
  const [rankMetric, setRankMetric] = React.useState<RankMetric>('profundidade')
  const [minDepth, setMinDepth] = React.useState('')
  const [chartTab, setChartTab] = React.useState<'condicao' | 'estado'>('condicao')
  const [isMobile, setIsMobile] = React.useState(false)
  const [collapsed, setCollapsed] = React.useState(false)
  const [filtersOpen, setFiltersOpen] = React.useState(false)

  const onSelect = React.useCallback((id: number | null) => {
    setSelectedId(id)
  }, [])
  const onMunicipioRef = React.useRef<(nome: string) => void>(() => undefined)

  const { loading, error, wells, census, applyWhere, zoomToPoco, releaseWell, clearMark, zoomToMunicipio, resize } = usePocosWebMap(mapNodeRef, onSelect, onMunicipioRef)

  const portalLogoUrl = `${props.context.folderUrl}dist/runtime/assets/portal-hero.png`
  const brasaoUrl = `${props.context.folderUrl}dist/runtime/assets/brasao.png`

  const yearBounds = React.useMemo(() => {
    const years = wells.map((item) => item.ano).filter((item): item is number => item != null)
    if (!years.length) return { min: 1950, max: new Date().getUTCFullYear() }
    return { min: Math.min(...years), max: Math.max(...years) }
  }, [wells])

  React.useEffect(() => {
    const media = window.matchMedia('(max-width: 860px)')
    const sync = () => {
      const mobile = media.matches
      setIsMobile(mobile)
      setCollapsed(mobile)
      if (mobile) setFiltersOpen(false)
    }
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  const municipios = React.useMemo(
    () => uniqueSorted(wells.map((item) => item.municipio)),
    [wells]
  )
  const condicoes = React.useMemo(
    () => uniqueSorted(wells.map((item) => item.condicao)),
    [wells]
  )
  const estados = React.useMemo(
    () => uniqueSorted(wells.map((item) => item.estado)),
    [wells]
  )

  const filtered = React.useMemo(() => {
    const term = fold(busca)
    const depth = Number(minDepth)
    const depthOn = minDepth.trim() !== '' && Number.isFinite(depth) && depth > 0
    const fromMs = dateFrom ? Date.parse(`${dateFrom}T00:00:00Z`) : null
    const toMs = dateTo ? Date.parse(`${dateTo}T00:00:00Z`) + 86400000 : null
    return wells.filter((item) => {
      if (municipio !== 'Todos' && item.municipio !== municipio) return false
      if (condicao !== 'Todos' && item.condicao !== condicao) return false
      if (estado !== 'Todos' && item.estado !== estado) return false
      if (depthOn && (item.profundidade == null || item.profundidade < depth)) return false
      if (fromMs != null && (item.perfuracao == null || item.perfuracao < fromMs)) return false
      if (toMs != null && (item.perfuracao == null || item.perfuracao >= toMs)) return false
      if (term && !fold(item.localidade).includes(term) && !fold(item.municipio).includes(term)) return false
      return true
    })
  }, [wells, municipio, condicao, estado, busca, dateFrom, dateTo, minDepth])

  React.useEffect(() => {
    setPage(1)
  }, [municipio, condicao, estado, busca, dateFrom, dateTo, minDepth])

  const where = React.useMemo(() => {
    const parts: string[] = []
    if (municipio !== 'Todos') parts.push(`municipio = '${sqlEscape(municipio)}'`)
    if (condicao !== 'Todos') parts.push(`condicao = '${sqlEscape(condicao)}'`)
    if (estado !== 'Todos') parts.push(`estado_qualitativo LIKE '${sqlEscape(estado)}%'`)
    const depth = Number(minDepth)
    if (minDepth.trim() !== '' && Number.isFinite(depth) && depth > 0) parts.push(`profundidade >= ${depth}`)
    if (busca.trim()) {
      const term = sqlEscape(busca.trim().toUpperCase())
      parts.push(`(UPPER(localidade) LIKE '%${term}%' OR UPPER(municipio) LIKE '%${term}%')`)
    }
    if (dateFrom) parts.push(`data_perfuracao >= DATE '${dateFrom}'`)
    if (dateTo) {
      const end = new Date(`${dateTo}T00:00:00Z`)
      end.setUTCDate(end.getUTCDate() + 1)
      parts.push(`data_perfuracao < DATE '${end.toISOString().slice(0, 10)}'`)
    }
    return parts.join(' AND ') || '1=1'
  }, [municipio, condicao, estado, busca, dateFrom, dateTo, minDepth])

  React.useEffect(() => {
    applyWhere(where)
  }, [where, applyWhere])

  const selected = filtered.find((item) => item.id === selectedId) || wells.find((item) => item.id === selectedId) || null
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const condicaoData = React.useMemo(() => condicaoSlices(filtered), [filtered])
  const estadoData = React.useMemo(() => estadoSlices(filtered), [filtered])
  const anos = React.useMemo(() => yearCounts(filtered), [filtered])

  const censoAtual = React.useMemo(() => {
    if (municipio === 'Todos') {
      return census.reduce((sum, item) => ({
        populacao: sum.populacao + item.populacao,
        domicilios: sum.domicilios + item.domicilios,
        nome: 'Bahia'
      }), { populacao: 0, domicilios: 0, nome: 'Bahia' })
    }
    const hit = census.find((item) => item.chave === fold(municipio))
    return {
      populacao: hit?.populacao || 0,
      domicilios: hit?.domicilios || 0,
      nome: hit?.nome || titleCase(municipio)
    }
  }, [census, municipio])

  React.useEffect(() => {
    if (view !== 'painel') return
    const timer = window.setTimeout(() => resize(), 240)
    return () => window.clearTimeout(timer)
  }, [view, collapsed, resize])

  const ranking = React.useMemo(() => rankMunicipios(filtered, rankMetric), [filtered, rankMetric])
  const maiores = React.useMemo(() => topPocos(filtered, rankMetric === 'quantidade' ? 'profundidade' : rankMetric), [filtered, rankMetric])
  const rankMax = Math.max(...ranking.map((item) => rankValue(item, rankMetric)), 1)

  const activeFilters = [municipio !== 'Todos', condicao !== 'Todos', estado !== 'Todos', Boolean(busca.trim()), minDepth.trim() !== '', Boolean(dateFrom || dateTo)].filter(Boolean).length

  const setDateBound = (edge: 'from' | 'to', value: string) => {
    const from = edge === 'from' ? value : dateFrom
    const to = edge === 'to' ? value : dateTo
    if (from && to && from > to) {
      setDateFrom(to)
      setDateTo(from)
      return
    }
    if (edge === 'from') setDateFrom(value)
    else setDateTo(value)
  }

  const applyPeriod = (from: string, to: string) => {
    if (dateFrom === from && dateTo === to) {
      setDateFrom('')
      setDateTo('')
      return
    }
    setDateFrom(from)
    setDateTo(to)
  }

  const clearFilters = () => {
    setMunicipio('Todos')
    setCondicao('Todos')
    setEstado('Todos')
    setBusca('')
    setMinDepth('')
    setDateFrom('')
    setDateTo('')
    setSelectedId(null)
    clearMark()
    zoomToMunicipio('')
  }

  const chooseMunicipio = (value: string) => {
    setMunicipio(value)
    setSelectedId(null)
    clearMark()
    if (value === 'Todos') zoomToMunicipio('')
    else zoomToMunicipio(value)
  }

  onMunicipioRef.current = (nome: string) => {
    const hit = municipios.find((item) => fold(item) === fold(nome))
    const value = hit || nome.toUpperCase()
    if (fold(municipio) === fold(value)) chooseMunicipio('Todos')
    else chooseMunicipio(value)
  }

  const leaveWell = () => {
    setSelectedId(null)
    releaseWell()
  }

  const chooseWell = (item: Poco) => {
    if (selectedId === item.id) {
      leaveWell()
      return
    }
    setSelectedId(item.id)
    setView('painel')
    zoomToPoco(item.id)
  }

  const pageClass = [
    'dp-page',
    'jimu-widget',
    collapsed ? 'is-collapsed' : '',
    isMobile ? 'is-mobile' : '',
    isMobile && !collapsed ? 'is-drawer-open' : ''
  ].filter(Boolean).join(' ')

  return (
    <div className={pageClass}>
      {isMobile && !collapsed && (
        <button type="button" className="dp-backdrop" aria-label="Fechar menu" onClick={() => setCollapsed(true)} />
      )}

      <aside className="dp-side" aria-label="Menu da Distribuição de Poços">
        <div className="dp-side__brand">
          <div className="dp-side__identity">
            <a className="dp-brand-btn" href={PORTAL_SITE_URL} target="_blank" rel="noopener noreferrer" title="Abrir Portal da Água" aria-label="Abrir Portal da Água">
              <img src={portalLogoUrl} alt="Portal da Água" />
            </a>
            <span className="dp-side__titles">
              <strong>Distribuição de Poços</strong>
              <em>Bahia</em>
            </span>
            <button type="button" className="dp-side__chevron" onClick={() => setCollapsed((open) => !open)} aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}>
              <ChevronIcon collapsed={collapsed} />
            </button>
          </div>
        </div>

        <nav className="dp-side__nav">
          <button type="button" className={view === 'painel' ? 'is-active' : ''} onClick={() => { setView('painel'); if (isMobile) setCollapsed(true) }}>
            <span className="dp-ico"><IconPainel /></span>
            <span className="dp-side__label">Painel</span>
          </button>
          <button type="button" className={view === 'ranking' ? 'is-active' : ''} onClick={() => { setView('ranking'); if (isMobile) setCollapsed(true) }}>
            <span className="dp-ico"><IconRank /></span>
            <span className="dp-side__label">Ranking</span>
          </button>
          <button type="button" className={view === 'listagem' ? 'is-active' : ''} onClick={() => { setView('listagem'); if (isMobile) setCollapsed(true) }}>
            <span className="dp-ico"><IconList /></span>
            <span className="dp-side__label">Listagem</span>
          </button>
        </nav>

        <footer className="dp-side__foot">
          <img className="dp-side__brasao" src={brasaoUrl} alt="Brasão do Estado da Bahia" />
          <div className="dp-side__foot-text">
            <small>Secretaria de</small>
            <strong>Infraestrutura Hídrica e Saneamento</strong>
            <b>SIHS</b>
          </div>
        </footer>
      </aside>

      <div className="dp-shell">
        <header className={`dp-top${isMobile && !filtersOpen ? ' is-compact' : ''}`}>
          <div className="dp-top__bar">
            <button type="button" className="dp-menu-btn" onClick={() => setCollapsed((open) => !open)} aria-label={collapsed ? 'Abrir menu' : 'Recolher menu'}>
              <MenuIcon open={!collapsed && isMobile} />
            </button>
            <button type="button" className="dp-filters-toggle" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen}>
              <span>Filtros</span>
              {activeFilters > 0 && <b>{activeFilters}</b>}
              <svg viewBox="0 0 24 24" aria-hidden="true">{filtersOpen ? <path d="M6 15l6-6 6 6" /> : <path d="M6 9l6 6 6-6" />}</svg>
            </button>
          </div>
          <div className="dp-filters">
            <Field label="Município">
              <select value={municipio} onChange={(event) => chooseMunicipio(event.target.value)}>
                <option value="Todos">Todos</option>
                {municipios.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
              </select>
            </Field>
            <Field label="Condição do poço">
              <select value={condicao} onChange={(event) => setCondicao(event.target.value)}>
                <option value="Todos">Todas</option>
                {condicoes.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
              </select>
            </Field>
            <Field label="Estado qualitativo">
              <select value={estado} onChange={(event) => setEstado(event.target.value)}>
                <option value="Todos">Todos</option>
                {estados.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
              </select>
            </Field>
            <Field label="Prof. mínima (m)">
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={minDepth}
                placeholder="Qualquer"
                onChange={(event) => setMinDepth(event.target.value)}
              />
            </Field>
            <Field label="Data da perfuração">
              <div className="dp-dates">
                <input
                  type="date"
                  value={dateFrom}
                  min={`${yearBounds.min}-01-01`}
                  max={dateTo || `${yearBounds.max}-12-31`}
                  aria-label="Perfuração a partir de"
                  onChange={(event) => setDateBound('from', event.target.value)}
                />
                <em>até</em>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || `${yearBounds.min}-01-01`}
                  max={`${yearBounds.max}-12-31`}
                  aria-label="Perfuração até"
                  onChange={(event) => setDateBound('to', event.target.value)}
                />
              </div>
            </Field>
            <Field label="Pesquisar localidade" className="dp-field--wide">
              <input type="search" value={busca} placeholder="Nome da localidade" onChange={(event) => setBusca(event.target.value)} />
            </Field>
          </div>
        </header>

        <main className="dp-main">
            <section className={`dp-stage${view !== 'painel' ? ' is-parked' : ''}`}>
              <div className="dp-kpis">
                <article>
                  <span className="dp-kpi__ico"><IconDrop /></span>
                  <div>
                    <small>Contagem de poços</small>
                    <strong>{formatNumber(filtered.length)}</strong>
                    <em>{censoAtual.nome === 'Bahia' ? 'Recorte atual' : censoAtual.nome}</em>
                  </div>
                </article>
                <article>
                  <span className="dp-kpi__ico"><IconPeople /></span>
                  <div>
                    <small>População total</small>
                    <strong>{census.length ? formatNumber(censoAtual.populacao) : '—'}</strong>
                    <em>Estimativa (IBGE, 2025)</em>
                  </div>
                </article>
                <article>
                  <span className="dp-kpi__ico"><IconHome /></span>
                  <div>
                    <small>Total de domicílios</small>
                    <strong>{census.length ? formatNumber(censoAtual.domicilios) : '—'}</strong>
                    <em>Censo (IBGE, 2022)</em>
                  </div>
                </article>
              </div>
              <article className="dp-list">
                <header className="dp-list__head">
                  <div>
                    <h2>Listagem de poços</h2>
                    <p>Poços tubulares perfurados pela CERB</p>
                  </div>
                  <strong>{formatNumber(filtered.length)}</strong>
                </header>
                <div className="dp-list__items">
                  {loading && <p className="dp-empty">Carregando poços…</p>}
                  {!loading && pageRows.length === 0 && <p className="dp-empty">Nenhum poço neste recorte.</p>}
                  {pageRows.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={item.id === selectedId ? 'is-on' : ''}
                      onClick={() => chooseWell(item)}
                    >
                      <b>{item.localidade}</b>
                      <small>Município de {item.municipio}/BA</small>
                      <em>{formatMetros(item.profundidade)} · {formatVazao(item.vazao)}</em>
                    </button>
                  ))}
                </div>
                <Pager page={safePage} pageCount={pageCount} onPage={setPage} />
              </article>

              <article className="dp-map" aria-label="Mapa da distribuição de poços">
                <div className="dp-map__view" ref={mapNodeRef} />
                {loading && <div className="dp-map__status">Carregando Web Map…</div>}
                {error && <div className="dp-map__status is-error">{error}</div>}
                {selected && (
                  <div className="dp-map__detail">
                    <button type="button" className="dp-map__close" onClick={leaveWell}>Sair</button>
                    <strong>{selected.localidade}</strong>
                    <span>{titleCase(selected.municipio)} · {titleCase(selected.condicao)}</span>
                    <span>{titleCase(selected.estado)}</span>
                    <span>Profundidade {formatMetros(selected.profundidade)} · Vazão {formatVazao(selected.vazao)}</span>
                    <span>Perfuração {formatDate(selected.perfuracao)}</span>
                  </div>
                )}
              </article>

              <div className="dp-charts">
                <article className="dp-chart">
                  <header>
                    <div className="dp-tabs">
                      <button type="button" className={chartTab === 'condicao' ? 'is-on' : ''} onClick={() => setChartTab('condicao')}>Condição do poço</button>
                      <button type="button" className={chartTab === 'estado' ? 'is-on' : ''} onClick={() => setChartTab('estado')}>Estado qualitativo</button>
                    </div>
                    <span>{formatNumber(filtered.length)} poços</span>
                  </header>
                  <PieChart
                    slices={chartTab === 'condicao' ? condicaoData : estadoData}
                    active={chartTab === 'condicao' ? condicao : estado}
                    onPick={(key) => {
                      if (key === 'Outros') return
                      if (chartTab === 'condicao') setCondicao(condicao === key ? 'Todos' : key)
                      else setEstado(estado === key ? 'Todos' : key)
                    }}
                  />
                </article>
                <article className="dp-chart">
                  <HistoryChart rows={anos} dateFrom={dateFrom} dateTo={dateTo} onPick={applyPeriod} />
                </article>
              </div>
            </section>

          {view === 'ranking' && (
            <section className="dp-rank">
              <header className="dp-rank__top">
                <div>
                  <h2>Maiores poços por município</h2>
                  <p>O ranking usa os filtros do topo, inclusive a profundidade mínima.</p>
                </div>
                <div className="dp-tabs">
                  <button type="button" className={rankMetric === 'profundidade' ? 'is-on' : ''} onClick={() => setRankMetric('profundidade')}>Profundidade</button>
                  <button type="button" className={rankMetric === 'vazao' ? 'is-on' : ''} onClick={() => setRankMetric('vazao')}>Vazão</button>
                  <button type="button" className={rankMetric === 'quantidade' ? 'is-on' : ''} onClick={() => setRankMetric('quantidade')}>Quantidade</button>
                </div>
              </header>
              <div className="dp-rank__grid">
                <article className="dp-chart">
                  <header>
                    <h3>Municípios</h3>
                    <span>{formatNumber(ranking.length)}</span>
                  </header>
                  <div className="dp-rank__list">
                    {ranking.slice(0, 20).map((item, index) => {
                      const value = rankValue(item, rankMetric)
                      const width = Math.max(4, (value / rankMax) * 100)
                      return (
                        <button type="button" key={item.nome} className={municipio === item.nome ? 'is-on' : ''} onClick={() => chooseMunicipio(municipio === item.nome ? 'Todos' : item.nome)}>
                          <b className={index < 3 ? 'is-medal' : ''}>{index + 1}</b>
                          <span>
                            <strong>{titleCase(item.nome)}</strong>
                            <i><em style={{ width: `${width}%` }} /></i>
                            <small>{formatNumber(item.pocos)} poços · maior {formatMetros(item.profundidadeMax)}</small>
                          </span>
                          <em>{rankMetric === 'vazao' ? formatVazao(item.vazaoMax) : rankMetric === 'quantidade' ? formatNumber(item.pocos) : formatMetros(item.profundidadeMax)}</em>
                        </button>
                      )
                    })}
                    {!loading && ranking.length === 0 && <p className="dp-empty">Nenhum município neste recorte.</p>}
                  </div>
                </article>
                <article className="dp-chart">
                  <header>
                    <h3>{rankMetric === 'vazao' ? 'Maiores vazões' : 'Poços mais profundos'}</h3>
                    <span>Toque para abrir no mapa</span>
                  </header>
                  <div className="dp-rank__wells">
                    {maiores.map((item, index) => (
                      <button type="button" key={item.id} className={item.id === selectedId ? 'is-on' : ''} onClick={() => chooseWell(item)}>
                        <b>{index + 1}</b>
                        <span>
                          <strong>{item.localidade}</strong>
                          <small>{titleCase(item.municipio)} · {titleCase(item.condicao)}</small>
                        </span>
                        <em>{rankMetric === 'vazao' ? formatVazao(item.vazao) : formatMetros(item.profundidade)}</em>
                      </button>
                    ))}
                    {!loading && maiores.length === 0 && <p className="dp-empty">Nenhum poço com essa medida.</p>}
                  </div>
                </article>
              </div>
            </section>
          )}

          {view === 'listagem' && (
            <section className="dp-tablecard">
              <header>
                <div>
                  <h2>Listagem de poços</h2>
                  <p>{formatNumber(filtered.length)} registros no recorte</p>
                </div>
                {activeFilters > 0 && <button type="button" onClick={clearFilters}>Limpar filtros</button>}
              </header>
              <div className="dp-table__wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Localidade</th>
                      <th>Município</th>
                      <th>Condição</th>
                      <th>Estado qualitativo</th>
                      <th>Vazão</th>
                      <th>Perfuração</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((item) => (
                      <tr key={item.id} className={item.id === selectedId ? 'is-on' : ''} onClick={() => chooseWell(item)}>
                        <td>{item.localidade}</td>
                        <td>{titleCase(item.municipio)}</td>
                        <td>{titleCase(item.condicao)}</td>
                        <td>{titleCase(item.estado)}</td>
                        <td>{formatVazao(item.vazao)}</td>
                        <td>{formatDate(item.perfuracao)}</td>
                      </tr>
                    ))}
                    {!loading && pageRows.length === 0 && (
                      <tr><td colSpan={6}>Nenhum poço neste recorte.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <Pager page={safePage} pageCount={pageCount} onPage={setPage} />
            </section>
          )}
        </main>
      </div>
    </div>
  )
}

const Field = ({ label, children, className = '' }: { label: string, children: React.ReactNode, className?: string }) => (
  <label className={`dp-field${className ? ` ${className}` : ''}`}>
    <span>{label}</span>
    {children}
  </label>
)

const Pager = ({ page, pageCount, onPage }: { page: number, pageCount: number, onPage: (page: number) => void }) => (
  <div className="dp-pager">
    <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</button>
    <span>{page} / {pageCount}</span>
    <button type="button" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>Próxima</button>
  </div>
)

const polar = (cx: number, cy: number, r: number, angle: number) => {
  const rad = (angle * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}

const donutSlice = (start: number, sweep: number) => {
  const end = start + sweep
  const large = sweep > 180 ? 1 : 0
  const [x1, y1] = polar(50, 50, 42, start)
  const [x2, y2] = polar(50, 50, 42, end)
  const [x3, y3] = polar(50, 50, 26, end)
  const [x4, y4] = polar(50, 50, 26, start)
  return `M ${x1} ${y1} A 42 42 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A 26 26 0 ${large} 0 ${x4} ${y4} Z`
}

const PieChart = ({ slices, active, onPick }: { slices: Slice[], active?: string, onPick?: (key: string) => void }) => {
  const [hover, setHover] = React.useState<string | null>(null)
  const total = slices.reduce((sum, item) => sum + item.value, 0)
  const focus = hover || (active && active !== 'Todos' ? active : '')
  if (!total) return <p className="dp-empty">Sem dados para o gráfico.</p>
  let cursor = -90
  const single = slices.length === 1
  const focused = slices.find((item) => item.key === focus)
  return (
    <div className="dp-pie">
      <div className="dp-pie__ring">
        <svg viewBox="0 0 100 100" role="img" aria-label="Distribuição">
          {single ? (
            <circle cx="50" cy="50" r="34" fill="none" stroke={slices[0].color} strokeWidth="16" />
          ) : slices.map((item) => {
            const sweep = (item.value / total) * 360
            const path = donutSlice(cursor, Math.max(sweep - 1.4, 0.6))
            cursor += sweep
            const dim = focus && focus !== item.key
            return (
              <path
                key={item.key}
                d={path}
                fill={item.color}
                opacity={dim ? 0.28 : 1}
                onMouseEnter={() => setHover(item.key)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onPick?.(item.key)}
              >
                <title>{item.label}: {formatNumber(item.value)}</title>
              </path>
            )
          })}
        </svg>
        <div className="dp-pie__center">
          <strong>{formatNumber(focused ? focused.value : total)}</strong>
          <small>{focused ? focused.label : 'poços'}</small>
        </div>
      </div>
      <ul>
        {slices.map((item) => (
          <li key={item.key} className={focus === item.key ? 'is-on' : ''} onMouseEnter={() => setHover(item.key)} onMouseLeave={() => setHover(null)} onClick={() => onPick?.(item.key)}>
            <i style={{ background: item.color }} />
            <span>{item.label}</span>
            <b>{Math.round((item.value / total) * 100)}%</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

const periodOf = (year: number, modo: 'decada' | 'ano') => {
  const end = modo === 'decada' ? year + 9 : year
  return { from: `${year}-01-01`, to: `${end}-12-31` }
}

const periodLabel = (year: number, modo: 'decada' | 'ano') => (
  modo === 'decada' ? `Década de ${year}` : String(year)
)

const HistoryChart = ({
  rows,
  dateFrom,
  dateTo,
  onPick
}: {
  rows: Array<{ year: number, value: number }>
  dateFrom: string
  dateTo: string
  onPick: (from: string, to: string) => void
}) => {
  const [modo, setModo] = React.useState<'decada' | 'ano'>('decada')
  const [hover, setHover] = React.useState<number | null>(null)
  const series = React.useMemo(() => {
    if (modo === 'ano') return rows
    const groups = new Map<number, number>()
    rows.forEach((item) => {
      const decade = Math.floor(item.year / 10) * 10
      groups.set(decade, (groups.get(decade) || 0) + item.value)
    })
    return Array.from(groups.entries()).map(([year, value]) => ({ year, value }))
  }, [rows, modo])

  const hovered = series.find((item) => item.year === hover) || null
  const tip = hovered
    ? `${periodLabel(hovered.year, modo)} · ${formatNumber(hovered.value)} poços`
    : 'Passe o mouse e clique num período para filtrar'

  return (
    <>
      <header>
        <h3>Histórico de perfuração</h3>
        <div className="dp-tabs">
          <button type="button" className={modo === 'decada' ? 'is-on' : ''} onClick={() => { setModo('decada'); setHover(null) }}>Década</button>
          <button type="button" className={modo === 'ano' ? 'is-on' : ''} onClick={() => { setModo('ano'); setHover(null) }}>Ano</button>
        </div>
      </header>
      {!rows.length ? <p className="dp-empty">Sem datas de perfuração neste recorte.</p> : (
        <div className="dp-bars">
          <p className="dp-bars__tip">{tip}</p>
          <svg viewBox="0 0 320 128" role="img" aria-label="Poços perfurados por período">
            <defs>
              <linearGradient id="dp-bar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7ed8ea" />
                <stop offset="100%" stopColor="#0b7c98" />
              </linearGradient>
              <linearGradient id="dp-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#16a6c0" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#16a6c0" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {modo === 'decada' ? (
              <DecadeBars series={series} hover={hover} dateFrom={dateFrom} dateTo={dateTo} onHover={setHover} onPick={onPick} />
            ) : (
              <YearArea series={series} hover={hover} dateFrom={dateFrom} dateTo={dateTo} onHover={setHover} onPick={onPick} />
            )}
          </svg>
        </div>
      )}
    </>
  )
}

const DecadeBars = ({
  series,
  hover,
  dateFrom,
  dateTo,
  onHover,
  onPick
}: {
  series: Array<{ year: number, value: number }>
  hover: number | null
  dateFrom: string
  dateTo: string
  onHover: (year: number | null) => void
  onPick: (from: string, to: string) => void
}) => {
  const max = Math.max(...series.map((item) => item.value), 1)
  const slot = 320 / Math.max(series.length, 1)
  return (
    <>
      <line x1="8" y1="100" x2="312" y2="100" stroke="#d5e3ea" strokeWidth="1" />
      {series.map((item, index) => {
        const period = periodOf(item.year, 'decada')
        const active = dateFrom === period.from && dateTo === period.to
        const hot = hover === item.year || active
        const height = Math.max(4, (item.value / max) * 78)
        const barWidth = Math.min(28, slot * 0.62)
        const x = index * slot + (slot - barWidth) / 2
        return (
          <g key={item.year}>
            <rect x={x} y={100 - height} width={barWidth} height={height} rx="4" fill={hot ? '#16a6c0' : 'url(#dp-bar)'} opacity={!hot && hover != null ? 0.4 : 1} pointerEvents="none" />
            {hot && <text className="is-value" x={x + barWidth / 2} y={Math.max(14, 96 - height)} textAnchor="middle" pointerEvents="none">{formatNumber(item.value)}</text>}
            <text x={index * slot + slot / 2} y="116" textAnchor="middle" pointerEvents="none">{item.year}</text>
            <rect
              x={index * slot}
              y="0"
              width={slot}
              height="128"
              fill="transparent"
              onMouseEnter={() => onHover(item.year)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onPick(period.from, period.to)}
            />
          </g>
        )
      })}
    </>
  )
}

const YearArea = ({
  series,
  hover,
  dateFrom,
  dateTo,
  onHover,
  onPick
}: {
  series: Array<{ year: number, value: number }>
  hover: number | null
  dateFrom: string
  dateTo: string
  onHover: (year: number | null) => void
  onPick: (from: string, to: string) => void
}) => {
  const max = Math.max(...series.map((item) => item.value), 1)
  const inner = 304
  const xAt = (index: number) => series.length <= 1 ? 160 : 8 + (index / (series.length - 1)) * inner
  const yAt = (value: number) => 100 - (value / max) * 80
  const line = series.map((item, index) => `${index === 0 ? 'M' : 'L'} ${xAt(index)} ${yAt(item.value)}`).join(' ')
  const area = `${line} L ${xAt(series.length - 1)} 100 L ${xAt(0)} 100 Z`
  const slot = series.length <= 1 ? 320 : inner / (series.length - 1)
  const hovered = series.find((item) => item.year === hover)
  const hoverIndex = hovered ? series.indexOf(hovered) : -1
  return (
    <>
      <line x1="8" y1="100" x2="312" y2="100" stroke="#d5e3ea" strokeWidth="1" />
      <path d={area} fill="url(#dp-area)" />
      <path d={line} fill="none" stroke="#0b7c98" strokeWidth="2" />
      {series.map((item, index) => {
        const showLabel = item.year % 10 === 0 || index === 0 || index === series.length - 1
        return showLabel ? <text key={item.year} x={xAt(index)} y="116" textAnchor="middle">{item.year}</text> : null
      })}
      {series.map((item, index) => {
        const period = periodOf(item.year, 'ano')
        const active = dateFrom === period.from && dateTo === period.to
        const left = index === 0 ? 0 : xAt(index) - slot / 2
        const right = index === series.length - 1 ? 320 : xAt(index) + slot / 2
        return (
          <rect
            key={item.year}
            x={left}
            y="0"
            width={Math.max(right - left, 1)}
            height="128"
            fill={active ? 'rgba(22, 166, 192, 0.16)' : 'transparent'}
            onMouseEnter={() => onHover(item.year)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onPick(period.from, period.to)}
          />
        )
      })}
      {hoverIndex >= 0 && (
        <>
          <line x1={xAt(hoverIndex)} y1="12" x2={xAt(hoverIndex)} y2="100" stroke="#16a6c0" strokeWidth="1.5" />
          <circle cx={xAt(hoverIndex)} cy={yAt(series[hoverIndex].value)} r="3.5" fill="#04364a" />
        </>
      )}
    </>
  )
}

const ChevronIcon = ({ collapsed }: { collapsed: boolean }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    {collapsed ? <path d="M9 6l6 6-6 6" /> : <path d="M15 6l-6 6 6 6" />}
  </svg>
)

const MenuIcon = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
  </svg>
)

const IconPainel = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="4" y="4" width="7" height="7" rx="1.4" />
    <rect x="13" y="4" width="7" height="4" rx="1.4" />
    <rect x="13" y="10" width="7" height="10" rx="1.4" />
    <rect x="4" y="13" width="7" height="7" rx="1.4" />
  </svg>
)

const IconRank = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 19V10M12 19V5M19 19v-7" />
  </svg>
)

const IconList = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M8 7h12M8 12h12M8 17h12" />
    <circle cx="4.5" cy="7" r="1" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="17" r="1" fill="currentColor" stroke="none" />
  </svg>
)

const IconDrop = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11z" /></svg>
)

const IconPeople = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="9" cy="8" r="2.2" />
    <circle cx="16" cy="9" r="1.7" />
    <path d="M4.5 18c.6-2.4 2.4-3.6 4.5-3.6s3.9 1.2 4.5 3.6M14 14.6c1.6-.2 3 .8 3.6 2.9" />
  </svg>
)

const IconHome = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 5l8 6.5V20H4z" /><path d="M10 20v-5h4v5" /></svg>
)

export default Widget
