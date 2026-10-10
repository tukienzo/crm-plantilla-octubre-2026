// Normaliza un teléfono a solo dígitos con código de país. Supone Argentina (54) cuando el número
// viene sin código (10 dígitos o con 0 adelante) y saca el 9 de los celulares (549…), igual que la
// zona horaria de la plantilla. Si operás en otro país, ajustá estas tres reglas.
export function canonicalPhone(value: unknown): string | null {
  let digits = String(value || "").replace(/\D/g, "")
  if (digits.startsWith("00")) digits = digits.slice(2)

  if (/^549\d{10}$/.test(digits)) digits = `54${digits.slice(3)}`
  else if (/^0\d{10}$/.test(digits)) digits = `54${digits.slice(1)}`
  else if (/^\d{10}$/.test(digits)) digits = `54${digits}`

  return digits.length >= 8 && digits.length <= 15 ? digits : null
}
