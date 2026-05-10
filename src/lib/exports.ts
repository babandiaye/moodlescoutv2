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

const PDF_C1 = '#1B4F72'
const PDF_C2 = '#2E86C1'
const PDF_GREEN = '#1E8449'
const PDF_ORANGE = '#D68910'
const PDF_RED = '#A93226'

function scoreColor(score: number): string {
  if (score >= 75) return PDF_GREEN
  if (score >= 50) return PDF_ORANGE
  return PDF_RED
}

export async function exportToPdf(courses: CourseData[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 45, right: 45 },
      info: { Title: 'MoodleScout v2 — Rapport audit', Author: 'UN-CHK DITSI' },
    })
    const chunks: Buffer[] = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // En-tête
    doc.fillColor(PDF_C1).fontSize(20).text('MoodleScout v2', { align: 'center' })
    doc.fillColor('#666').fontSize(9).text('Rapport audit pédagogique — UN-CHK DITSI', {
      align: 'center',
    })
    doc.moveDown(0.3)
    doc.fillColor('#999').fontSize(8).text(
      `Généré le ${new Date().toLocaleString('fr-FR')} — ${courses.length} cours`,
      { align: 'center' },
    )
    doc.moveDown(1)

    // Synthèse globale
    const totalCourses = courses.length
    const moy =
      totalCourses > 0
        ? Math.round(courses.reduce((s, c) => s + Number(c.score_global ?? 0), 0) / totalCourses)
        : 0
    const conformes = courses.filter(c => (c.score_global ?? 0) >= 75).length
    const aAmeliorer = courses.filter(
      c => (c.score_global ?? 0) >= 50 && (c.score_global ?? 0) < 75,
    ).length
    const nonConformes = courses.filter(c => (c.score_global ?? 0) < 50).length

    doc.fillColor(PDF_C2).fontSize(13).text('Synthèse')
    doc.moveDown(0.3)
    doc.fillColor('#000').fontSize(10)
    doc.text(`Score moyen : ${moy}/100`)
    doc.text(`Conformes (≥75) : ${conformes}`)
    doc.text(`A améliorer (50–74) : ${aAmeliorer}`)
    doc.text(`Non conformes (<50) : ${nonConformes}`)
    doc.moveDown(1)

    // Détail par cours
    courses.forEach((c, idx) => {
      if (idx > 0) doc.addPage()
      const score = Number(c.score_global ?? 0)
      doc.fillColor(PDF_C1).fontSize(14).text(c.fullname ?? '—')
      doc.fillColor('#666').fontSize(9).text(
        `${c.shortname ?? ''} — ${c.platform ?? ''} — ${c.category ?? ''}`,
      )
      doc.moveDown(0.5)

      doc.fillColor(scoreColor(score)).fontSize(24).text(`${score}/100`, { continued: false })
      doc.fillColor('#666').fontSize(9).text(c.conformite_statut ?? '')
      doc.moveDown(0.5)

      doc.fillColor('#000').fontSize(9)
      const stats: Array<[string, string | number]> = [
        ['Inscrits', c.nb_inscrits ?? 0],
        ['Enseignants', c.nb_enseignants ?? 0],
        ['Tuteurs', c.nb_tuteurs ?? 0],
        ['Sections', c.nb_sections ?? 0],
        ['Activités', c.nb_activites ?? 0],
        ['Quiz', c.nb_quiz ?? 0],
        ['Devoirs', c.nb_devoirs ?? 0],
        ['Forums', c.nb_forums ?? 0],
        ['Vidéo', c.has_video ? 'Oui' : 'Non'],
        ['Conformité', `${c.conformite_pct ?? 0}%`],
      ]
      stats.forEach(([k, v]) => doc.text(`${k} : ${v}`))
      doc.moveDown(0.5)

      if (c.ai?.description_courte) {
        doc.fillColor(PDF_C2).fontSize(11).text('Description IA')
        doc.fillColor('#000').fontSize(9).text(c.ai.description_courte)
        doc.moveDown(0.5)
      }

      if (c.ai?.objectifs_pedagogiques?.length) {
        doc.fillColor(PDF_C2).fontSize(11).text('Objectifs pédagogiques')
        doc.fillColor('#000').fontSize(9)
        for (const o of c.ai.objectifs_pedagogiques) doc.text(`• ${o}`)
        doc.moveDown(0.5)
      }

      if (c.ai?.points_forts?.length) {
        doc.fillColor(PDF_GREEN).fontSize(11).text('Points forts')
        doc.fillColor('#000').fontSize(9)
        for (const p of c.ai.points_forts) doc.text(`• ${p}`)
        doc.moveDown(0.5)
      }

      if (c.ai?.points_faibles?.length) {
        doc.fillColor(PDF_RED).fontSize(11).text('Points faibles')
        doc.fillColor('#000').fontSize(9)
        for (const p of c.ai.points_faibles) doc.text(`• ${p}`)
        doc.moveDown(0.5)
      }

      if (c.ai?.recommandations?.length) {
        doc.fillColor(PDF_ORANGE).fontSize(11).text('Recommandations')
        doc.fillColor('#000').fontSize(9)
        for (const r of c.ai.recommandations) doc.text(`• ${r}`)
        doc.moveDown(0.5)
      }

      if (c.animateurs?.length) {
        doc.fillColor(PDF_C2).fontSize(11).text('Animateurs')
        doc.fillColor('#000').fontSize(9)
        for (const a of c.animateurs) {
          const line = `• ${a.nom}${a.role_label ? ` — ${a.role_label}` : ''}${a.email ? ` — ${a.email}` : ''}`
          doc.text(line)
        }
      }
    })

    doc.end()
  })
}
