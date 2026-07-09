import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'

type CourseData = Record<string, any>

const SCORE_BG_GREEN = 'FFD5F5E3'
const SCORE_BG_YELLOW = 'FFFEF9E7'
const SCORE_BG_RED = 'FFFADBD8'

function scoreBg(score: number): string {
  if (score >= 75) return SCORE_BG_GREEN
  if (score >= 50) return SCORE_BG_YELLOW
  return SCORE_BG_RED
}

function styleHeader(row: ExcelJS.Row, color: string) {
  row.height = 28
  row.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color}` } }
    cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 10 }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = { bottom: { style: 'medium', color: { argb: 'FFAAAAAA' } } }
  })
}

function applyCellStyle(
  cell: ExcelJS.Cell,
  opts: { bold?: boolean; halign?: 'left' | 'center' | 'right'; bg?: string | null } = {},
) {
  cell.alignment = { wrapText: true, vertical: 'top', horizontal: opts.halign ?? 'left' }
  cell.border = {
    bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
    left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
    right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
  }
  if (opts.bold) cell.font = { bold: true }
  if (opts.bg) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.bg } }
  }
}

export async function exportToExcel(courses: CourseData[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'MoodleScout v2'
  wb.created = new Date()

  // Feuille 1 — Cours
  const ws1 = wb.addWorksheet('Cours')
  ws1.columns = [
    { header: 'Plateforme', width: 16 },
    { header: 'Moodle', width: 7 },
    { header: 'Code', width: 13 },
    { header: 'Intitulé', width: 32 },
    { header: 'Catégorie', width: 16 },
    { header: 'Visible', width: 6 },
    { header: 'Créé', width: 7 },
    { header: 'Révisé', width: 7 },
    { header: 'Inscrits', width: 7 },
    { header: 'Étudiants', width: 8 },
    { header: 'Enseignants', width: 9 },
    { header: 'Séquences', width: 8 },
    { header: 'Activités', width: 8 },
    { header: 'Quiz', width: 6 },
    { header: 'Devoirs', width: 6 },
    { header: 'Forums', width: 6 },
    { header: 'Score', width: 8 },
    { header: 'Niveau', width: 11 },
    { header: 'Durée', width: 11 },
    { header: 'Langue', width: 7 },
    { header: 'Domaine', width: 14 },
    { header: 'Animateur principal', width: 22 },
    { header: 'Description IA', width: 38 },
  ]
  styleHeader(ws1.getRow(1), '1B4F72')
  courses.forEach((c, idx) => {
    const animList = c.animateurs ?? []
    const am =
      animList.length > 0
        ? `${animList[0].nom}${animList[0].departement ? ` (${animList[0].departement})` : ''}`
        : '—'
    const score = Number(c.score_global ?? 0)
    const bg = idx % 2 === 0 ? 'FFF2F9FF' : null
    const row = ws1.addRow([
      c.platform ?? '',
      `v${c.moodle_version ?? '4'}.x`,
      c.shortname ?? '',
      c.fullname ?? '',
      c.category ?? '',
      c.visible ? 'Oui' : 'Non',
      String(c.year_created ?? '—'),
      String(c.year_modified ?? '—'),
      Number(c.nb_inscrits ?? 0),
      Number(c.nb_etudiants ?? 0),
      Number(c.nb_enseignants ?? 0),
      Number(c.nb_sections ?? 0),
      Number(c.nb_activites ?? 0),
      Number(c.nb_quiz ?? 0),
      Number(c.nb_devoirs ?? 0),
      Number(c.nb_forums ?? 0),
      score,
      c.ai?.niveau ?? '',
      c.ai?.duree_estimee ?? '',
      c.ai?.langue ?? '',
      c.ai?.domaine ?? '',
      am,
      c.ai?.description_courte ?? '',
    ])
    const centerCols = new Set([1, 2, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17])
    row.eachCell((cell, col) => {
      const halign: 'left' | 'center' = centerCols.has(col) ? 'center' : 'left'
      const cellBg = col === 17 ? scoreBg(score) : bg
      applyCellStyle(cell, { bold: col === 17, halign, bg: cellBg })
    })
  })
  ws1.views = [{ state: 'frozen', xSplit: 3, ySplit: 1 }]

  // Feuille 2 — Scores
  const ws2 = wb.addWorksheet('Scores')
  ws2.columns = [
    { header: 'Plateforme', width: 16 },
    { header: 'Code', width: 13 },
    { header: 'Intitulé', width: 30 },
    { header: 'Score /100', width: 9 },
    { header: 'Pertinence /10', width: 10 },
    { header: 'Eval /10', width: 8 },
    { header: 'Structure /10', width: 10 },
    { header: 'Engagement /10', width: 10 },
    { header: 'Points forts', width: 38 },
    { header: 'Points faibles', width: 38 },
    { header: 'Recommandations', width: 38 },
    { header: 'Justification', width: 38 },
  ]
  styleHeader(ws2.getRow(1), '2E86C1')
  for (const c of courses) {
    const score = Number(c.score_global ?? 0)
    const row = ws2.addRow([
      c.platform ?? '',
      c.shortname ?? '',
      c.fullname ?? '',
      score,
      Number(c.ai?.pertinence_contenu ?? 0),
      Number(c.ai?.qualite_evaluation ?? 0),
      Number(c.ai?.structure_pedagogique ?? 0),
      Number(c.ai?.engagement_prevu ?? 0),
      (c.ai?.points_forts ?? []).join(' | '),
      (c.ai?.points_faibles ?? []).join(' | '),
      (c.ai?.recommandations ?? []).join(' | '),
      c.ai?.justification_score ?? '',
    ])
    row.eachCell((cell, col) => {
      const halign: 'left' | 'center' = col <= 8 ? 'center' : 'left'
      const bg = col === 4 ? scoreBg(score) : null
      applyCellStyle(cell, { bold: col === 4, halign, bg })
    })
  }
  ws2.views = [{ state: 'frozen', ySplit: 1 }]

  // Feuille 3 — Animateurs
  const ws3 = wb.addWorksheet('Animateurs')
  ws3.columns = [
    { header: 'Plateforme', width: 16 },
    { header: 'Code', width: 13 },
    { header: 'Intitulé', width: 30 },
    { header: 'Nom', width: 22 },
    { header: 'Email', width: 26 },
    { header: 'Rôle(s)', width: 14 },
    { header: 'Département', width: 14 },
    { header: 'Bio/Infos', width: 32 },
  ]
  styleHeader(ws3.getRow(1), '1E8449')
  for (const c of courses) {
    for (const a of c.animateurs ?? []) {
      const row = ws3.addRow([
        c.platform ?? '',
        c.shortname ?? '',
        c.fullname ?? '',
        a.nom ?? '',
        a.email ?? '',
        (a.roles ?? []).join(', '),
        a.departement ?? '',
        a.bio ?? '',
      ])
      row.eachCell(cell => applyCellStyle(cell, { halign: 'left' }))
    }
  }
  ws3.views = [{ state: 'frozen', ySplit: 1 }]

  // Feuille 4 — Quiz
  const ws4 = wb.addWorksheet('Quiz')
  ws4.columns = [
    { header: 'Plateforme', width: 16 },
    { header: 'Code', width: 13 },
    { header: 'Cours', width: 28 },
    { header: 'Quiz', width: 28 },
    { header: 'Nb questions', width: 10 },
    { header: 'Note max', width: 9 },
    { header: 'Tentatives', width: 10 },
    { header: 'Terminées', width: 9 },
    { header: 'Participants', width: 11 },
    { header: 'Taux particip. %', width: 14 },
    { header: 'Score moyen', width: 11 },
    { header: 'Score max', width: 11 },
    { header: 'Score min', width: 11 },
    { header: 'Taux complétion %', width: 13 },
    { header: 'Durée (min)', width: 10 },
  ]
  styleHeader(ws4.getRow(1), '1B4F72')
  for (const c of courses) {
    for (const q of c.quiz_stats ?? []) {
      const row = ws4.addRow([
        c.platform ?? '',
        c.shortname ?? '',
        c.fullname ?? '',
        q.nom ?? '',
        Number(q.nb_questions ?? 0),
        Number(q.note_max ?? 0),
        Number(q.attempts ?? 0),
        Number(q.attempts_termines ?? 0),
        Number(q.nb_participants ?? 0),
        Number(q.taux_participation ?? 0),
        Number(q.score_moyen ?? 0),
        Number(q.score_max_obtenu ?? 0),
        Number(q.score_min_obtenu ?? 0),
        Number(q.taux_completion ?? 0),
        Number(q.time_limit_min ?? 0),
      ])
      row.eachCell(cell => applyCellStyle(cell, { halign: 'center' }))
    }
  }
  ws4.views = [{ state: 'frozen', ySplit: 1 }]

  // Feuille 5 — Activités
  const ws5 = wb.addWorksheet('Activites')
  ws5.columns = [
    { header: 'Plateforme', width: 16 },
    { header: 'Code', width: 13 },
    { header: 'Section', width: 20 },
    { header: 'Activité', width: 30 },
    { header: 'Type', width: 16 },
    { header: 'Visible', width: 6 },
    { header: 'Description', width: 38 },
    { header: 'Fichiers', width: 22 },
  ]
  styleHeader(ws5.getRow(1), '1B4F72')
  for (const c of courses) {
    for (const a of c.activities ?? []) {
      const row = ws5.addRow([
        c.platform ?? '',
        c.shortname ?? '',
        a.section ?? '',
        a.name ?? '',
        a.type_label ?? a.type ?? '',
        a.visible ? 'Oui' : 'Non',
        a.description ?? '',
        (a.files ?? []).join(', '),
      ])
      row.eachCell(cell => applyCellStyle(cell, { halign: 'left' }))
    }
  }
  ws5.views = [{ state: 'frozen', ySplit: 1 }]

  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

// ─── Export CSV ──────────────────────────────────────────────
//
// RFC 4180 : virgule séparateur, quote seulement si nécessaire (contient ,;"
// ou saut de ligne), doubler les guillemets à l'intérieur. On préfixe le
// fichier d'un BOM UTF-8 pour qu'Excel/LibreOffice détectent l'encodage sans
// que l'utilisateur ait à choisir.

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(',')
}

/**
 * Export CSV plat (1 ligne = 1 cours). Colonnes = mêmes que la feuille "Cours"
 * du XLSX pour rester cohérent — un utilisateur qui exporte les deux formats
 * doit retrouver ses colonnes au même endroit.
 */
export function exportToCsv(courses: CourseData[]): Buffer {
  const headers = [
    'Plateforme',
    'Moodle',
    'Code',
    'Intitulé',
    'Catégorie',
    'Chemin catégorie',
    'Visible',
    'Créé',
    'Révisé',
    'Inscrits',
    'Étudiants',
    'Enseignants',
    'Tuteurs',
    'Séquences',
    'Activités',
    'Quiz',
    'Devoirs',
    'Forums',
    'Ressources',
    'Score global',
    'Score IA',
    'Score conformité',
    'Conformité (%)',
    'Statut conformité',
    'Pertinence /10',
    'Éval /10',
    'Structure /10',
    'Engagement /10',
    'Niveau',
    'Durée estimée',
    'Langue',
    'Domaine',
    'Animateur principal',
    'Description IA',
    'Points forts',
    'Points faibles',
    'Recommandations',
    'Justification',
  ]
  const lines: string[] = [csvRow(headers)]

  for (const c of courses) {
    const animList = (c.animateurs ?? []) as any[]
    const am = animList.length > 0
      ? `${animList[0].nom ?? ''}${animList[0].departement ? ` (${animList[0].departement})` : ''}`
      : ''
    const categoryPath = Array.isArray(c.category_path) ? c.category_path.join(' / ') : ''

    lines.push(csvRow([
      c.platform ?? '',
      `v${c.moodle_version ?? '4'}.x`,
      c.shortname ?? '',
      c.fullname ?? '',
      c.category ?? '',
      categoryPath,
      c.visible ? 'Oui' : 'Non',
      c.year_created ?? '',
      c.year_modified ?? '',
      Number(c.nb_inscrits ?? 0),
      Number(c.nb_etudiants ?? 0),
      Number(c.nb_enseignants ?? 0),
      Number(c.nb_tuteurs ?? 0),
      Number(c.nb_sections ?? 0),
      Number(c.nb_activites ?? 0),
      Number(c.nb_quiz ?? 0),
      Number(c.nb_devoirs ?? 0),
      Number(c.nb_forums ?? 0),
      Number(c.nb_ressources ?? 0),
      Number(c.score_global ?? 0),
      Number(c.score_ia ?? 0),
      Number(c.score_struct ?? 0),
      Number(c.conformite_pct ?? 0),
      c.conformite_statut ?? '',
      Number(c.ai?.pertinence_contenu ?? 0),
      Number(c.ai?.qualite_evaluation ?? 0),
      Number(c.ai?.structure_pedagogique ?? 0),
      Number(c.ai?.engagement_prevu ?? 0),
      c.ai?.niveau ?? '',
      c.ai?.duree_estimee ?? '',
      c.ai?.langue ?? '',
      c.ai?.domaine ?? '',
      am,
      c.ai?.description_courte ?? '',
      (c.ai?.points_forts ?? []).join(' | '),
      (c.ai?.points_faibles ?? []).join(' | '),
      (c.ai?.recommandations ?? []).join(' | '),
      c.ai?.justification_score ?? '',
    ]))
  }

  // BOM UTF-8 devant : Excel/LibreOffice détectent l'encodage correctement.
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(lines.join('\r\n'), 'utf8')])
}

const PDF_C1 = '#1B4F72'
const PDF_C2 = '#2E86C1'
const PDF_GREEN = '#1E8449'
const PDF_ORANGE = '#D68910'
const PDF_RED = '#A93226'

const PDF_BG_GREEN = '#E8F5E9'
const PDF_BG_ORANGE = '#FFF3E0'
const PDF_BG_RED = '#FFEBEE'

function scoreColor(score: number): string {
  if (score >= 75) return PDF_GREEN
  if (score >= 50) return PDF_ORANGE
  return PDF_RED
}

function scoreBgColor(score: number): string {
  if (score >= 75) return PDF_BG_GREEN
  if (score >= 50) return PDF_BG_ORANGE
  return PDF_BG_RED
}

function scoreLabel(score: number): string {
  if (score >= 90) return 'Excellent'
  if (score >= 75) return 'Très bon'
  if (score >= 50) return 'À améliorer'
  return 'Non conforme'
}

type Align = 'left' | 'center' | 'right'

function drawTextCell(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  opts: {
    align?: Align
    color?: string
    fontSize?: number
    bold?: boolean
    padding?: number
    valign?: 'top' | 'middle'
  } = {},
) {
  const pad = opts.padding ?? 6
  const align: Align = opts.align ?? 'left'
  const fontSize = opts.fontSize ?? 9
  const color = opts.color ?? '#000000'
  doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize).fillColor(color)
  const textWidth = width - 2 * pad
  const textHeight = doc.heightOfString(text || ' ', { width: textWidth, align })
  const ty =
    opts.valign === 'middle'
      ? y + Math.max(pad, (height - textHeight) / 2)
      : y + pad
  doc.text(text, x + pad, ty, { width: textWidth, align })
}

type TableCol = { label: string; width: number; align?: Align }
type TableCell =
  | string
  | { text: string; fill?: string; color?: string; bold?: boolean; fontSize?: number }

/**
 * Mini-moteur de tableau au-dessus de PDFKit.
 * - Mesure la hauteur réelle du texte de chaque cellule (heightOfString) puis
 *   prend le max comme hauteur de ligne -> empêche le débordement "Durée".
 * - Trace rectangle (remplissage facultatif) + bordure 0.5pt + texte centré
 *   verticalement.
 */
function drawTable(
  doc: PDFKit.PDFDocument,
  startY: number,
  cols: TableCol[],
  rows: TableCell[][],
  opts: {
    headerFill?: string
    headerColor?: string
    border?: string
    fontSize?: number
    headerFontSize?: number
    padding?: number
    minRowHeight?: number
  } = {},
): number {
  const startX = doc.page.margins.left
  const fontSize = opts.fontSize ?? 9
  const headerFontSize = opts.headerFontSize ?? 10
  const padding = opts.padding ?? 6
  const headerFill = opts.headerFill ?? PDF_C1
  const headerColor = opts.headerColor ?? '#FFFFFF'
  const border = opts.border ?? '#CCCCCC'
  const minRowHeight = opts.minRowHeight ?? 28

  const headerHeight = Math.max(24, headerFontSize + 2 * padding)
  let cx = startX
  for (const col of cols) {
    doc.rect(cx, startY, col.width, headerHeight).fill(headerFill)
    drawTextCell(doc, cx, startY, col.width, headerHeight, col.label, {
      align: col.align ?? 'center',
      color: headerColor,
      fontSize: headerFontSize,
      bold: true,
      padding,
      valign: 'middle',
    })
    cx += col.width
  }
  let y = startY + headerHeight

  for (const row of rows) {
    doc.font('Helvetica').fontSize(fontSize)
    let rowHeight = 0
    for (let i = 0; i < cols.length; i++) {
      const cell = row[i] ?? ''
      const text = typeof cell === 'string' ? cell : cell.text
      const fs = typeof cell === 'object' && cell.fontSize ? cell.fontSize : fontSize
      doc.fontSize(fs)
      const w = cols[i].width - 2 * padding
      const h = doc.heightOfString(text || ' ', { width: w, align: cols[i].align ?? 'left' })
      if (h > rowHeight) rowHeight = h
    }
    rowHeight = Math.max(minRowHeight, rowHeight + 2 * padding)

    cx = startX
    for (let i = 0; i < cols.length; i++) {
      const cell = row[i] ?? ''
      const text = typeof cell === 'string' ? cell : cell.text
      const fill = typeof cell === 'object' ? cell.fill : undefined
      const color = typeof cell === 'object' ? cell.color : undefined
      const bold = typeof cell === 'object' ? !!cell.bold : false
      const cellFontSize =
        typeof cell === 'object' && cell.fontSize ? cell.fontSize : fontSize

      if (fill) {
        doc.rect(cx, y, cols[i].width, rowHeight).fill(fill)
      }
      doc
        .lineWidth(0.5)
        .strokeColor(border)
        .rect(cx, y, cols[i].width, rowHeight)
        .stroke()

      drawTextCell(doc, cx, y, cols[i].width, rowHeight, text, {
        align: cols[i].align ?? 'left',
        color: color ?? '#000000',
        fontSize: cellFontSize,
        bold,
        padding,
        valign: 'middle',
      })
      cx += cols[i].width
    }
    y += rowHeight
  }
  return y
}

function formatList(items: string[], sep: string): string {
  return items
    .map(o => String(o).trim())
    .filter(Boolean)
    .map(o => (o.endsWith('.') ? o : o + '.'))
    .join(sep)
}

export async function exportToPdf(courses: CourseData[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 45, bottom: 45, left: 45, right: 45 },
      info: { Title: "MoodleScout — Rapport d'Audit", Author: 'UN-CHK DITSI' },
    })
    const chunks: Buffer[] = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const ml = doc.page.margins.left
    const pageWidth = doc.page.width - ml - doc.page.margins.right // ~505pt sur A4
    const colW5 = pageWidth / 5

    const totalCourses = courses.length
    const moy =
      totalCourses > 0
        ? Math.round(
            courses.reduce((s, c) => s + Number(c.score_global ?? 0), 0) / totalCourses,
          )
        : 0
    const totalInscrits = courses.reduce((s, c) => s + Number(c.nb_inscrits ?? 0), 0)
    const totalQuiz = courses.reduce((s, c) => s + Number(c.nb_quiz ?? 0), 0)
    const conformes = courses.filter(c => Number(c.score_global ?? 0) >= 75).length

    // ── En-tête général ────────────────────────────────────────────
    // Titre puis sous-titre EN-DESSOUS avec un moveDown explicite : empêche
    // le chevauchement observé dans l'ancienne version (capture utilisateur).
    doc.font('Helvetica-Bold').fontSize(22).fillColor(PDF_C1)
    doc.text("MoodleScout — Rapport d'Audit", ml, doc.page.margins.top, {
      width: pageWidth,
      align: 'center',
    })
    doc.moveDown(0.5)

    const now = new Date()
    const dateStr = `${now.toLocaleDateString('fr-FR')} ${now.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    })}`
    doc.font('Helvetica').fontSize(10).fillColor('#7F8C8D')
    doc.text(
      `UN-CHK DITSI | ${dateStr} | ${totalCourses} cours analysés`,
      ml,
      doc.y,
      { width: pageWidth, align: 'center' },
    )

    const sepY = doc.y + 10
    doc
      .lineWidth(1.5)
      .strokeColor(PDF_C1)
      .moveTo(ml, sepY)
      .lineTo(ml + pageWidth, sepY)
      .stroke()

    // ── Synthèse globale ───────────────────────────────────────────
    let nextY = drawTable(
      doc,
      sepY + 18,
      [
        { label: 'Cours', width: colW5, align: 'center' },
        { label: 'Score moyen', width: colW5, align: 'center' },
        { label: 'Inscrits', width: colW5, align: 'center' },
        { label: 'Quiz', width: colW5, align: 'center' },
        { label: 'Score ≥ 75', width: colW5, align: 'center' },
      ],
      [
        [
          { text: String(totalCourses), bold: true, color: PDF_C1, fontSize: 16 },
          { text: `${moy}/100`, bold: true, color: PDF_C1, fontSize: 16 },
          { text: String(totalInscrits), bold: true, color: PDF_C1, fontSize: 16 },
          { text: String(totalQuiz), bold: true, color: PDF_C1, fontSize: 16 },
          { text: String(conformes), bold: true, color: PDF_C1, fontSize: 16 },
        ],
      ],
      { headerFill: PDF_C1, minRowHeight: 40 },
    )

    // ── Par cours ──────────────────────────────────────────────────
    courses.forEach((c, idx) => {
      if (idx === 0) {
        doc.x = ml
        doc.y = nextY + 18
      } else {
        doc.addPage()
        doc.x = ml
        doc.y = doc.page.margins.top
      }
      const score = Number(c.score_global ?? 0)
      const ai = c.ai ?? {}

      doc.font('Helvetica-Bold').fontSize(15).fillColor(PDF_C1)
      doc.text(`${c.shortname ?? ''} — ${c.fullname ?? '—'}`, ml, doc.y, {
        width: pageWidth,
        align: 'left',
      })

      const subParts: string[] = []
      if (c.platform) subParts.push(String(c.platform))
      if (c.category) subParts.push(`(${c.category})`)
      subParts.push(`(Moodle ${c.moodle_version ?? '4'}.x)`)
      const subline = [
        subParts.join(' '),
        `${c.nb_inscrits ?? 0} inscrits`,
        c.visible ? 'Visible' : 'Masqué',
        `Créé ${c.year_created ?? '—'}`,
        `Révisé ${c.year_modified ?? '—'}`,
      ].join(' | ')
      doc.font('Helvetica').fontSize(9).fillColor('#7F8C8D')
      doc.text(subline, ml, doc.y + 2, { width: pageWidth, align: 'left' })

      // Table scores (5 colonnes, header bleu clair, cellule Score colorée)
      nextY = drawTable(
        doc,
        doc.y + 12,
        [
          { label: 'Score', width: colW5, align: 'center' },
          { label: 'Pertinence', width: colW5, align: 'center' },
          { label: 'Évaluation', width: colW5, align: 'center' },
          { label: 'Structure', width: colW5, align: 'center' },
          { label: 'Engagement', width: colW5, align: 'center' },
        ],
        [
          [
            {
              text: `${score}/100\n${scoreLabel(score)}`,
              bold: true,
              color: scoreColor(score),
              fill: scoreBgColor(score),
              fontSize: 12,
            },
            `${ai.pertinence_contenu ?? 0}/10`,
            `${ai.qualite_evaluation ?? 0}/10`,
            `${ai.structure_pedagogique ?? 0}/10`,
            `${ai.engagement_prevu ?? 0}/10`,
          ],
        ],
        { headerFill: PDF_C2, minRowHeight: 44 },
      )

      // Table stats (8 colonnes, header vert).
      // Niveau et Durée sont élargies pour absorber un libellé long type
      // "(1 semaine pour les généralités, 2 semaines pour le bilan...)"
      // sans déborder sur la colonne voisine (bug capture).
      const sw1 = 70
      const sw2 = 105
      const swRest = (pageWidth - sw1 - sw2) / 6
      nextY = drawTable(
        doc,
        nextY + 2,
        [
          { label: 'Niveau', width: sw1, align: 'center' },
          { label: 'Durée', width: sw2, align: 'center' },
          { label: 'Inscrits', width: swRest, align: 'center' },
          { label: 'Enseignants', width: swRest, align: 'center' },
          { label: 'Sections', width: swRest, align: 'center' },
          { label: 'Activités', width: swRest, align: 'center' },
          { label: 'Quiz', width: swRest, align: 'center' },
          { label: 'Devoirs', width: swRest, align: 'center' },
        ],
        [
          [
            String(ai.niveau ?? '—'),
            String(ai.duree_estimee ?? '—'),
            String(c.nb_inscrits ?? 0),
            String(c.nb_enseignants ?? 0),
            String(c.nb_sections ?? 0),
            String(c.nb_activites ?? 0),
            String(c.nb_quiz ?? 0),
            String(c.nb_devoirs ?? 0),
          ],
        ],
        { headerFill: PDF_GREEN, minRowHeight: 32 },
      )

      doc.x = ml
      doc.y = nextY + 14

      // ── Détails (label gras + valeur courante, comme la capture) ──
      const writeLabelValue = (label: string, value: string, italic = false) => {
        doc.x = ml
        doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .fillColor('#000')
          .text(`${label} : `, { continued: true, width: pageWidth })
        doc
          .font(italic ? 'Helvetica-Oblique' : 'Helvetica')
          .fillColor('#333')
          .text(value, { width: pageWidth })
        doc.moveDown(0.3)
      }

      if (ai.description_courte) writeLabelValue('Description', String(ai.description_courte))
      if (ai.infos_image) writeLabelValue('Infos image', String(ai.infos_image))
      if (ai.public_cible) writeLabelValue('Public cible', String(ai.public_cible))
      if (ai.domaine) writeLabelValue('Domaine', String(ai.domaine))

      const animList = (c.animateurs ?? []) as any[]
      if (animList.length) {
        const animTxt = animList
          .map(a => `${a.nom ?? 'Inconnu'}${a.role_label ? ` ${a.role_label}` : ''}`)
          .join(' , ')
        writeLabelValue('Animateurs', animTxt)
      }

      if (ai.objectifs_pedagogiques?.length) {
        writeLabelValue('Objectifs', formatList(ai.objectifs_pedagogiques as string[], ' ; '))
      }
      if (ai.points_forts?.length) {
        writeLabelValue('Points forts', formatList(ai.points_forts as string[], ' · '))
      }
      if (ai.points_faibles?.length) {
        writeLabelValue('Points faibles', formatList(ai.points_faibles as string[], ' · '))
      }
      if (ai.recommandations?.length) {
        writeLabelValue('Recommandations', formatList(ai.recommandations as string[], ' · '))
      }
      if (ai.justification_score) {
        writeLabelValue('Justification', String(ai.justification_score), true)
      }
    })

    doc.end()
  })
}
