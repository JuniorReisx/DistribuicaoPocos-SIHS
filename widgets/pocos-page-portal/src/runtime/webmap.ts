import { React, getAppStore } from 'jimu-core'
import { loadArcGISJSAPIModules } from 'jimu-arcgis'
import { clean, fold, sqlEscape, yearOf, type CensoMun, type Poco } from './data'

export const WEBMAP_ID = '1224ae8aaa704c4393b03be11b75426c'
export const PORTAL_URL = 'https://portaldaagua.sihs.ba.gov.br/portal'

const POCO_FIELDS = [
  'objectid',
  'localidade',
  'municipio',
  'condicao',
  'estado_qualitativo',
  'vazao',
  'profundidade',
  'finalidade',
  'aquifero',
  'data_perfuracao'
]

const toArray = (collection: any): any[] => {
  if (!collection) return []
  if (Array.isArray(collection)) return collection
  if (typeof collection.toArray === 'function') return collection.toArray()
  const items: any[] = []
  collection.forEach?.((item: any) => items.push(item))
  return items
}

const findLayer = (webmap: any, test: (title: string) => boolean) => {
  return toArray(webmap?.allLayers).find((layer) => test(fold(layer?.title)))
}

const readNumber = (value: unknown) => {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : null
}

const toPoco = (feature: any): Poco => {
  const attrs = feature?.attributes || {}
  const perfuracao = readNumber(attrs.data_perfuracao)
  return {
    id: Number(attrs.objectid),
    localidade: clean(attrs.localidade) || 'Sem localidade',
    municipio: clean(attrs.municipio) || 'Não informado',
    condicao: clean(attrs.condicao) || 'SEM INFORMAÇÃO',
    estado: clean(attrs.estado_qualitativo) || 'NÃO INFORMADO',
    vazao: readNumber(attrs.vazao),
    profundidade: readNumber(attrs.profundidade),
    finalidade: clean(attrs.finalidade),
    aquifero: clean(attrs.aquifero),
    perfuracao,
    ano: yearOf(perfuracao)
  }
}

const toCenso = (feature: any): CensoMun | null => {
  const attrs = feature?.attributes || {}
  const nome = clean(attrs.nome_do_municipio)
  if (!nome) return null
  return {
    nome,
    chave: fold(nome),
    populacao: readNumber(attrs.estimativa_pop_2025) || 0,
    domicilios: readNumber(attrs['total_domicílios_recenseados__2']) || 0
  }
}

const queryAll = async (layer: any, outFields: string[]) => {
  await layer.load?.()
  const count = await layer.queryFeatureCount({ where: '1=1' })
  const size = Math.min(layer.maxRecordCount || 2000, 8000)
  const features: any[] = []
  const order = layer.objectIdField || 'objectid'
  for (let start = 0; start < Math.max(count, 1); start += size) {
    const result = await layer.queryFeatures({
      where: '1=1',
      outFields,
      returnGeometry: false,
      num: size,
      start,
      orderByFields: [order]
    })
    const page = result?.features || []
    features.push(...page)
    if (!page.length || features.length >= count) break
  }
  return features
}

export const usePocosWebMap = (
  containerRef: { current: HTMLDivElement | null },
  onSelect: (id: number | null) => void,
  onMunicipioRef: { current: (nome: string) => void }
) => {
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [wells, setWells] = React.useState<Poco[]>([])
  const [census, setCensus] = React.useState<CensoMun[]>([])
  const viewRef = React.useRef<any>(null)
  const homeExtentRef = React.useRef<any>(null)
  const pocosRef = React.useRef<any>(null)
  const censoRef = React.useRef<any>(null)
  const highlightRef = React.useRef<any>(null)
  const munHighlightRef = React.useRef<any>(null)
  const outlineRef = React.useRef<any>(null)
  const graphicCtorRef = React.useRef<any>(null)
  const munGraphicsRef = React.useRef<any[]>([])
  const wellGraphicsRef = React.useRef<any[]>([])
  const selectedRef = React.useRef<number | null>(null)
  const beforeRef = React.useRef<any>(null)
  const whereRef = React.useRef('1=1')
  const onSelectRef = React.useRef(onSelect)
  onSelectRef.current = onSelect

  const clearWellOutline = () => {
    const layer = outlineRef.current
    wellGraphicsRef.current.forEach((item) => layer?.remove?.(item))
    wellGraphicsRef.current = []
  }

  const clearHighlight = React.useCallback(() => {
    highlightRef.current?.remove?.()
    highlightRef.current = null
    clearWellOutline()
  }, [])

  const applyWhere = React.useCallback((where: string) => {
    whereRef.current = where || '1=1'
    const layer = pocosRef.current
    if (!layer) return
    layer.definitionExpression = whereRef.current === '1=1' ? null : whereRef.current
  }, [])

  const rememberView = () => {
    const view = viewRef.current
    if (!view || beforeRef.current) return
    beforeRef.current = view.viewpoint?.clone?.() || view.extent?.clone?.() || null
  }

  const goBack = async () => {
    const view = viewRef.current
    const back = beforeRef.current || homeExtentRef.current
    beforeRef.current = null
    if (view && back) await view.goTo(back, { duration: 650 }).catch(() => undefined)
  }

  const clearMark = React.useCallback(() => {
    clearHighlight()
    selectedRef.current = null
    beforeRef.current = null
  }, [clearHighlight])

  const releaseWell = React.useCallback(async () => {
    clearHighlight()
    selectedRef.current = null
    await goBack()
  }, [clearHighlight])

  const zoomToPoco = React.useCallback(async (id: number) => {
    const view = viewRef.current
    const layer = pocosRef.current
    if (!view || !layer || !Number.isFinite(id)) return
    try {
      const oid = layer.objectIdField || 'objectid'
      const result = await layer.queryFeatures({
        where: `${oid} = ${id}`,
        outFields: [oid],
        returnGeometry: true
      })
      const graphic = result?.features?.[0]
      if (!graphic) return
      const layerView = await view.whenLayerView(layer)
      rememberView()
      selectedRef.current = id
      clearHighlight()
      highlightRef.current = layerView?.highlight?.(graphic)
      const Graphic = graphicCtorRef.current
      const outline = outlineRef.current
      if (Graphic && outline && graphic.geometry) {
        const halo = new Graphic({
          geometry: graphic.geometry,
          symbol: { type: 'simple-marker', style: 'circle', color: [0, 0, 0, 0], size: 28, outline: { color: [255, 255, 255, 0.95], width: 5 } }
        })
        const ring = new Graphic({
          geometry: graphic.geometry,
          symbol: { type: 'simple-marker', style: 'circle', color: [0, 0, 0, 0], size: 22, outline: { color: [4, 54, 74, 1], width: 3 } }
        })
        outline.addMany([halo, ring])
        wellGraphicsRef.current = [halo, ring]
      }
      await view.goTo({ target: graphic, zoom: Math.max(view.zoom || 0, 13) }, { duration: 700 })
    } catch (_err) {}
  }, [clearHighlight])

  const focusWell = React.useCallback(async (id: number) => {
    if (selectedRef.current === id) {
      onSelectRef.current(null)
      await releaseWell()
      return
    }
    onSelectRef.current(id)
    await zoomToPoco(id)
  }, [releaseWell, zoomToPoco])

  const focusRef = React.useRef(focusWell)
  const releaseRef = React.useRef(releaseWell)
  focusRef.current = focusWell
  releaseRef.current = releaseWell

  const resize = React.useCallback(() => {
    viewRef.current?.resize?.()
  }, [])

  const clearMunHighlight = () => {
    const layer = outlineRef.current
    munGraphicsRef.current.forEach((item) => layer?.remove?.(item))
    munGraphicsRef.current = []
    munHighlightRef.current?.remove?.()
    munHighlightRef.current = null
  }

  const zoomToMunicipio = React.useCallback(async (nome: string) => {
    const view = viewRef.current
    const layer = censoRef.current
    if (!view) return
    if (!nome) {
      clearMunHighlight()
      const home = homeExtentRef.current
      if (home) await view.goTo(home, { duration: 700 }).catch(() => undefined)
      return
    }
    if (!layer || typeof layer.queryFeatures !== 'function') return
    try {
      const result = await layer.queryFeatures({
        where: `UPPER(nome_do_municipio) = '${sqlEscape(nome.toUpperCase())}'`,
        outFields: ['nome_do_municipio'],
        returnGeometry: true
      })
      const graphic = result?.features?.[0]
      if (!graphic?.geometry?.extent || graphic.geometry.extent.isEmpty) return
      clearMunHighlight()
      const Graphic = graphicCtorRef.current
      const outline = outlineRef.current
      if (Graphic && outline) {
        const halo = new Graphic({
          geometry: graphic.geometry,
          symbol: { type: 'simple-fill', color: [0, 0, 0, 0], outline: { color: [255, 255, 255, 0.95], width: 7 } }
        })
        const contour = new Graphic({
          geometry: graphic.geometry,
          symbol: { type: 'simple-fill', color: [22, 166, 192, 0.16], outline: { color: [4, 54, 74, 1], width: 3 } }
        })
        outline.addMany([halo, contour])
        munGraphicsRef.current = [halo, contour]
      }
      await view.goTo(graphic.geometry.extent.clone().expand(1.6), { duration: 700 })
    } catch (_err) {}
  }, [])

  React.useEffect(() => {
    let cancelled = false
    let clickHandle: any

    const start = async () => {
      const node = containerRef.current
      if (!node) {
        window.setTimeout(() => { if (!cancelled) start() }, 60)
        return
      }
      setLoading(true)
      setError('')

      try {
        const [esriConfig, Portal, WebMap, MapView, Home, GraphicsLayer, Graphic] = await loadArcGISJSAPIModules([
          'esri/config',
          'esri/portal/Portal',
          'esri/WebMap',
          'esri/views/MapView',
          'esri/widgets/Home',
          'esri/layers/GraphicsLayer',
          'esri/Graphic'
        ])

        const portalUrl = getAppStore().getState()?.portalUrl || PORTAL_URL
        esriConfig.portalUrl = portalUrl
        const portal = new Portal({ url: portalUrl, authMode: 'auto' })
        await portal.load()

        const webmap = new WebMap({ portalItem: { id: WEBMAP_ID, portal } })
        await webmap.load()
        await webmap.loadAll()
        if (cancelled) return

        const pocos = findLayer(webmap, (title) => title.includes('distribuicao de pocos'))
        const censo = findLayer(webmap, (title) => title.includes('municipios_2026') || title.includes('municipios 2026'))
        if (!pocos) throw new Error('A camada Distribuição de Poços não está no Web Map.')
        pocosRef.current = pocos
        censoRef.current = censo

        const view = new MapView({
          container: node,
          map: webmap,
          ui: { components: ['zoom', 'attribution'] }
        })
        if ('popupEnabled' in view) view.popupEnabled = false
        else if (view.popup) view.popup.autoOpenEnabled = false
        viewRef.current = view
        await view.when()
        if (cancelled) return

        const stateLayer = censo || pocos
        try {
          const extentResult = await stateLayer.queryExtent?.({ where: '1=1' })
          const extent = extentResult?.extent
          if (extent && !extent.isEmpty) {
            const bahia = extent.clone().expand(1.08)
            homeExtentRef.current = bahia
            view.resize?.()
            await view.goTo(bahia, { animate: false })
          }
        } catch (_err) {}
        const outline = new GraphicsLayer({ listMode: 'hide', title: 'Seleção' })
        webmap.add(outline)
        outlineRef.current = outline
        graphicCtorRef.current = Graphic
        view.ui.add(new Home({ view, viewpoint: view.viewpoint?.clone?.() || view.viewpoint }), 'top-left')

        const wellFeatures = await queryAll(pocos, POCO_FIELDS)
        if (cancelled) return
        if (whereRef.current !== '1=1') pocos.definitionExpression = whereRef.current
        setWells(wellFeatures.map(toPoco).filter((item) => Number.isFinite(item.id)))

        if (censo) {
          try {
            await censo.load?.()
            const censusFeatures = await censo.queryFeatures({
              where: '1=1',
              outFields: ['nome_do_municipio', 'estimativa_pop_2025', 'total_domicílios_recenseados__2'],
              returnGeometry: false
            })
            if (!cancelled) {
              setCensus((censusFeatures?.features || []).map(toCenso).filter(Boolean) as CensoMun[])
            }
          } catch (_err) {}
        }

        clickHandle = view.on('click', async (event: any) => {
          const hit = await view.hitTest(event)
          const graphic = hit?.results?.find((item: any) => item.graphic?.layer === pocos)?.graphic
          if (graphic) {
            const id = Number(graphic.attributes?.[pocos.objectIdField || 'objectid'])
            if (Number.isFinite(id)) focusRef.current(id)
            return
          }
          if (censo && event.mapPoint) {
            try {
              const result = await censo.queryFeatures({
                geometry: event.mapPoint,
                spatialRelationship: 'intersects',
                outFields: ['nome_do_municipio'],
                returnGeometry: false
              })
              const nome = clean(result?.features?.[0]?.attributes?.nome_do_municipio)
              if (nome) {
                if (selectedRef.current != null) {
                  clearHighlight()
                  selectedRef.current = null
                  beforeRef.current = null
                  onSelectRef.current(null)
                }
                onMunicipioRef.current(nome)
                return
              }
            } catch (_err) {}
          }
          if (selectedRef.current != null) {
            onSelectRef.current(null)
            releaseRef.current()
          }
        })

        setLoading(false)
      } catch (err: any) {
        if (cancelled) return
        const message = String(err?.message || err || '')
        const denied = /permission|403|sign|login|credential|unauthorized|token/i.test(message)
        setError(denied
          ? 'O Web Map é da organização. Entre com um usuário SIHS para carregar os poços.'
          : message || 'Não foi possível carregar o Web Map.')
        setLoading(false)
      }
    }

    start()

    return () => {
      cancelled = true
      clickHandle?.remove?.()
      highlightRef.current?.remove?.()
      munHighlightRef.current?.remove?.()
      outlineRef.current = null
      graphicCtorRef.current = null
      munGraphicsRef.current = []
      wellGraphicsRef.current = []
      viewRef.current?.destroy?.()
      viewRef.current = null
      pocosRef.current = null
      censoRef.current = null
    }
  }, [containerRef, clearHighlight])

  return { loading, error, wells, census, applyWhere, zoomToPoco, releaseWell, clearMark, zoomToMunicipio, resize }
}
