export const CONDICAO_PRINCIPAL = [
  'VAZÃO APROVEITÁVEL',
  'SECO',
  'VAZÃO INSUFICIENTE',
  'ABANDONADO',
  'FURO PERDIDO',
  'OBSTRUÍDO'
]

export const CONDICAO_COR: Record<string, string> = {
  'VAZÃO APROVEITÁVEL': '#2f6fe0',
  SECO: '#e24b4b',
  'VAZÃO INSUFICIENTE': '#f0c14a',
  ABANDONADO: '#2f9b57',
  'FURO PERDIDO': '#7b5cc4',
  'OBSTRUÍDO': '#e07a3d',
  Outros: '#8aa0ad'
}

export const ESTADO_COR: Record<string, string> = {
  'NÃO INFORMADO': '#8aa0ad',
  'INADEQUADA PARA CONSUMO HUMANO': '#e24b4b',
  'ADEQUADA PARA CONSUMO HUMANO': '#2f9b57',
  'UTILIZÁVEL APÓS TRATAMENTO': '#e07a3d',
  'UTILIZÁVEL SOB CIRCUNSTÂNCIAS ESPECIAIS': '#7b5cc4',
  'ACONSELHÁVEL NOVA AMOSTRAGEM': '#f0c14a',
  'PARÂMETROS INSUFICIENTES PARA CLASSIFICAÇÃO': '#5e7a87',
  'VIDE PARECER': '#2f6fe0'
}

const ESTADO_FALLBACK = ['#2f6fe0', '#16a6c0', '#2f9b57', '#e0a21a', '#e07a3d', '#7b5cc4', '#8aa0ad']

export interface Poco {
  id: number
  localidade: string
  municipio: string
  condicao: string
  estado: string
  vazao: number | null
  profundidade: number | null
  finalidade: string
  aquifero: string
  perfuracao: number | null
  ano: number | null
}

export interface CensoMun {
  nome: string
  chave: string
  populacao: number
  domicilios: number
}

export interface Slice {
  key: string
  label: string
  value: number
  color: string
}

export const fold = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase()

export const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim()

export const sqlEscape = (value: string) => String(value || '').replace(/'/g, "''")

export const formatNumber = (value: number) => new Intl.NumberFormat('pt-BR').format(Math.round(value || 0))

export const formatVazao = (value: number | null) => {
  if (value == null || Number.isNaN(value)) return '—'
  return `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} m³/s`
}

export const formatMetros = (value: number | null) => {
  if (value == null || !Number.isFinite(value) || value <= 0) return '—'
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value)} m`
}

export const formatDate = (value: number | null) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${date.getUTCFullYear()}`
}

export const titleCase = (value: string) => {
  const text = clean(value)
  if (!text) return 'Não informado'
  return text
    .toLowerCase()
    .split(' ')
    .map((part) => part ? part.charAt(0).toUpperCase() + part.slice(1) : part)
    .join(' ')
}

export const yearOf = (value: number | null) => {
  if (!value) return null
  const year = new Date(value).getUTCFullYear()
  return year >= 1900 && year <= 2100 ? year : null
}

export const uniqueSorted = (values: string[]) => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'))

export const condicaoSlices = (rows: Poco[]): Slice[] => {
  const counts = new Map<string, number>()
  rows.forEach((row) => {
    const key = row.condicao || 'SEM INFORMAÇÃO'
    counts.set(key, (counts.get(key) || 0) + 1)
  })
  const head = CONDICAO_PRINCIPAL.map((key) => ({
    key,
    label: titleCase(key),
    value: counts.get(key) || 0,
    color: CONDICAO_COR[key]
  })).filter((item) => item.value > 0)
  let outros = 0
  counts.forEach((value, key) => {
    if (!CONDICAO_PRINCIPAL.includes(key)) outros += value
  })
  if (outros) head.push({ key: 'Outros', label: 'Outros', value: outros, color: CONDICAO_COR.Outros })
  return head
}

export const estadoSlices = (rows: Poco[]): Slice[] => {
  const counts = new Map<string, number>()
  rows.forEach((row) => {
    const key = row.estado || 'NÃO INFORMADO'
    counts.set(key, (counts.get(key) || 0) + 1)
  })
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key, value], index) => ({
      key,
      label: titleCase(key),
      value,
      color: ESTADO_COR[key] || ESTADO_FALLBACK[index % ESTADO_FALLBACK.length]
    }))
}

export type RankMetric = 'profundidade' | 'vazao' | 'quantidade'

export interface MunRank {
  nome: string
  pocos: number
  profundidadeMax: number
  vazaoMax: number
  maior: Poco | null
}

export const rankMunicipios = (rows: Poco[], metric: RankMetric): MunRank[] => {
  const groups = new Map<string, MunRank>()
  rows.forEach((row) => {
    const current = groups.get(row.municipio) || {
      nome: row.municipio,
      pocos: 0,
      profundidadeMax: 0,
      vazaoMax: 0,
      maior: null
    }
    current.pocos += 1
    if ((row.profundidade || 0) > current.profundidadeMax) current.profundidadeMax = row.profundidade || 0
    if ((row.vazao || 0) > current.vazaoMax) current.vazaoMax = row.vazao || 0
    const score = metric === 'vazao' ? (row.vazao || 0) : (row.profundidade || 0)
    const best = metric === 'vazao' ? (current.maior?.vazao || 0) : (current.maior?.profundidade || 0)
    if (!current.maior || score > best) current.maior = row
    groups.set(row.municipio, current)
  })
  return Array.from(groups.values()).sort((a, b) => {
    if (metric === 'quantidade') return b.pocos - a.pocos || b.profundidadeMax - a.profundidadeMax
    if (metric === 'vazao') return b.vazaoMax - a.vazaoMax || b.pocos - a.pocos
    return b.profundidadeMax - a.profundidadeMax || b.pocos - a.pocos
  })
}

export const rankValue = (item: MunRank, metric: RankMetric) => {
  if (metric === 'quantidade') return item.pocos
  if (metric === 'vazao') return item.vazaoMax
  return item.profundidadeMax
}

export const topPocos = (rows: Poco[], metric: RankMetric, limit = 12) => {
  const valueOf = (row: Poco) => metric === 'vazao' ? (row.vazao || 0) : (row.profundidade || 0)
  return rows
    .filter((row) => valueOf(row) > 0)
    .sort((a, b) => valueOf(b) - valueOf(a))
    .slice(0, limit)
}

export const yearCounts = (rows: Poco[]) => {
  const counts = new Map<number, number>()
  rows.forEach((row) => {
    if (!row.ano) return
    counts.set(row.ano, (counts.get(row.ano) || 0) + 1)
  })
  return Array.from(counts.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, value]) => ({ year, value }))
}
