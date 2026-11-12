/**
 * Reusable data sets for TechnicalDropdown components.
 * Fully configurable, dynamic, and decoupled from component markup.
 */

export const SPECIALIZATIONS_DATA = {
  id: 'specializations',
  telemetry: '[59, -25, 5]',
  counter: '01 // 05',
  items: [
    { id: 1, num: '1 /', label: 'Brand Designer', hasSquare: true },
    { id: 2, num: '2 /', label: 'Logo Designer', hasSquare: true },
    { id: 3, num: '3 /', label: 'Full-stack Webs', hasSquare: true },
    { id: 4, num: '4 /', label: 'Software & Apps', hasSquare: true },
    { id: 5, num: '5 /', label: 'Prototypes', hasSquare: true },
  ],
}

export const TOOLS_TECHS_DATA = {
  id: 'tools',
  telemetry: '[42, -18, 9]',
  counter: '01 // 05',
  items: [
    { id: 1, num: '1 /', label: 'Adobe Illustrator', icon: '/assets/ai.svg' },
    { id: 2, num: '2 /', label: 'Adobe Photoshop', icon: '/assets/ps.svg' },
    { id: 3, num: '3 /', label: 'React 19 & WebGL', icon: '/assets/react.svg' },
    { id: 4, num: '4 /', label: 'Google Antigravity', icon: '/assets/antigravity.svg' },
    {
      id: 5,
      num: '5 /',
      label: 'Claude Code & Codex',
      icons: ['/assets/claude.svg', '/assets/codex.svg'],
    },
  ],
}
