// Semanas comerciales de un mes (lunes a domingo, recortadas al mes). Si la primera o la última
// semana quedan con 2 días o menos, se suman a la vecina para no tener una "semana" de un fin de
// semana suelto. La usan Métricas (pantalla y API) para el filtro por semana.

/** Rangos [díaDesde, díaHasta] de cada semana del mes `AAAA-MM`. Vacío si el mes es inválido. */
export function semanasDelMes(mes: string): Array<[number, number]> {
  const m = String(mes || "").match(/^(\d{4})-(\d{2})$/)
  if (!m) return []
  const anio = Number(m[1]), mesNum = Number(m[2])
  const ultimo = new Date(anio, mesNum, 0).getDate()
  const semanas: Array<[number, number]> = []
  let desde = 1
  for (let dia = 1; dia <= ultimo; dia++) {
    const esDomingo = new Date(anio, mesNum - 1, dia).getDay() === 0
    if (esDomingo || dia === ultimo) {
      semanas.push([desde, dia])
      desde = dia + 1
    }
  }
  if (semanas.length > 1 && semanas[0][1] - semanas[0][0] + 1 <= 2) {
    const [primera, segunda] = semanas.splice(0, 2)
    semanas.unshift([primera[0], segunda[1]])
  }
  const n = semanas.length
  if (n > 1 && semanas[n - 1][1] - semanas[n - 1][0] + 1 <= 2) {
    const ultima = semanas.pop()!
    semanas[n - 2] = [semanas[n - 2][0], ultima[1]]
  }
  return semanas
}

/** Igual que semanasDelMes, con la etiqueta para la pantalla ("S1 1-7"). */
export function semanasConEtiqueta(mes: string): Array<[number, number, string]> {
  return semanasDelMes(mes).map(([d, h], i) => [d, h, `S${i + 1} ${d}-${h}`])
}
