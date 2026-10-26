import { React, type AllWidgetProps } from 'jimu-core'
import './style.css'

const PORTAL_SITE_URL = 'https://portaldaagua.sihs.ba.gov.br/'

const Widget = (props: AllWidgetProps<any>) => {
  const portalLogoUrl = `${props.context.folderUrl}dist/runtime/assets/portal-hero.png`
  const brasaoUrl = `${props.context.folderUrl}dist/runtime/assets/brasao.png`

  return (
    <header className="hd-header jimu-widget">
      <a
        className="hd-header__brand"
        href={PORTAL_SITE_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Abrir Portal da Água"
        title="Portal da Água"
      >
        <img className="hd-header__portal" src={portalLogoUrl} alt="Portal da Água" />
      </a>
      <footer className="hd-header__foot">
        <img className="hd-header__brasao" src={brasaoUrl} alt="Brasão do Estado da Bahia" />
        <span className="hd-header__titles">
          <span className="hd-header__eyebrow">Secretaria de</span>
          <span className="hd-header__title">Infraestrutura Hídrica e Saneamento</span>
          <span className="hd-header__sigla">SIHS</span>
        </span>
      </footer>
    </header>
  )
}

export default Widget
