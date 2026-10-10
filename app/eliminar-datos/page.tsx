import type { Metadata } from "next"
import { BRAND } from "@/lib/brand"

// PLANTILLA: este texto es un punto de partida razonable, no asesoramiento legal.
// Hacelo revisar por un abogado de tu país antes de publicarlo y ajustá los plazos.
//
// Instrucciones de eliminación de datos. Meta las exige para publicar una app
// (Configuración básica → Eliminación de datos de usuario → URL de instrucciones).
// Página pública y estática: el middleware la deja pasar (ver su matcher). Razón social y
// mail salen de lib/brand.ts (NEXT_PUBLIC_BRAND_LEGAL_NAME, NEXT_PUBLIC_BRAND_CONTACT_EMAIL).
export const metadata: Metadata = {
  title: `Eliminación de datos · ${BRAND.name}`,
  description: `Cómo pedir que ${BRAND.legalName} elimine tus datos personales.`,
}

const CONTACTO = BRAND.contactEmail

export default function EliminarDatosPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-14">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-zinc-500">{BRAND.legalName}</p>
      <h1 className="mt-2 text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">Eliminación de datos</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
        Si alguna vez nos escribiste por Instagram o Facebook, agendaste una llamada con nosotros o fuiste cliente,
        tenemos datos tuyos y podés pedir que los borremos. No hace falta ningún motivo.
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Cómo pedirlo</h2>
        <ol className="mt-3 space-y-3 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
          <li>
            <b>1.</b> Escribí un correo{" "}
            {CONTACTO ? (
              <>
                a{" "}
                <a className="font-semibold text-blue-600 underline underline-offset-2 dark:text-blue-400" href={`mailto:${CONTACTO}?subject=Eliminaci%C3%B3n%20de%20datos`}>{CONTACTO}</a>
              </>
            ) : (
              "al mail de contacto que figura en el sitio"
            )}{" "}
            con el asunto <b>&quot;Eliminación de datos&quot;</b>.
          </li>
          <li>
            <b>2.</b> Decinos con qué te contactaste con nosotros: tu usuario de Instagram, tu teléfono o el correo que usaste.
            Con eso encontramos tu ficha.
          </li>
          <li>
            <b>3.</b> Te confirmamos por correo cuando esté hecho, <b>dentro de los 30 días</b>.
          </li>
        </ol>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Qué se borra</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
          Tu ficha completa en nuestro sistema: datos de contacto, historial de conversación, llamadas agendadas,
          grabaciones y notas asociadas.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Qué no podemos borrar</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
          Si nos compraste, las facturas y los comprobantes de pago tenemos que conservarlos por obligación contable y
          fiscal. En ese caso borramos todo lo demás y dejamos solo el registro contable mínimo, con acceso restringido.
        </p>
        <p className="mt-2 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
          Los mensajes que sigan en tu propia cuenta de Instagram o Facebook los controlás vos desde esas aplicaciones:
          nosotros borramos nuestra copia.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Más información</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
          Podés leer qué datos tratamos y para qué en nuestra{" "}
          <a className="font-semibold text-blue-600 underline underline-offset-2 dark:text-blue-400" href="/privacidad">política de privacidad</a>.
        </p>
      </section>
    </main>
  )
}
