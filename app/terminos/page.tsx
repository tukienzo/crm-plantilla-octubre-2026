import type { Metadata } from "next"
import { BRAND } from "@/lib/brand"

// PLANTILLA: este texto es un punto de partida razonable, no asesoramiento legal.
// Hacelo revisar por un abogado de tu país antes de publicarlo y ajustalo a lo que
// vendés de verdad (alcance, pagos, devoluciones, jurisdicción).
//
// Condiciones del servicio públicas. Meta las pide en la configuración básica de una app
// (URL de Condiciones del servicio). Página estática y sin sesión: el middleware la deja
// pasar (ver su matcher). Razón social, mail y sitio salen de lib/brand.ts
// (NEXT_PUBLIC_BRAND_LEGAL_NAME, NEXT_PUBLIC_BRAND_CONTACT_EMAIL, NEXT_PUBLIC_BRAND_SITE).
export const metadata: Metadata = {
  title: `Términos y condiciones · ${BRAND.name}`,
  description: `Condiciones del servicio de ${BRAND.legalName}: qué incluye lo que contratás, pagos, acceso, propiedad intelectual y contacto.`,
}

// Cambiá esta fecha cada vez que edites el texto.
const ACTUALIZADO = "completá la fecha al revisar este texto"
const CONTACTO = BRAND.contactEmail

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{titulo}</h2>
      <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">{children}</div>
    </section>
  )
}

// "a mail@…" con link, o una indicación genérica si el mail no está cargado.
function Contacto() {
  if (!CONTACTO) return <>al mail de contacto que figura en el sitio</>
  return (
    <>
      a{" "}
      <a className="font-semibold text-blue-600 underline underline-offset-2 dark:text-blue-400" href={`mailto:${CONTACTO}`}>{CONTACTO}</a>
    </>
  )
}

export default function TerminosPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-14">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-zinc-500">{BRAND.legalName}</p>
      <h1 className="mt-2 text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">Términos y condiciones</h1>
      <p className="mt-2 text-sm text-zinc-500">Última actualización: {ACTUALIZADO}</p>

      <Seccion titulo="1. Qué es esto">
        <p>
          Estas condiciones regulan el uso {BRAND.site ? <>del sitio <b>{BRAND.site}</b>, </> : "de nuestro sitio, "}de
          nuestras cuentas oficiales en redes sociales y de los productos y servicios que comercializa {BRAND.legalName}
          {" "}(&quot;{BRAND.name}&quot;, &quot;nosotros&quot;). Al contratar o usar el sitio, aceptás lo que sigue.
        </p>
      </Seccion>

      <Seccion titulo="2. Qué incluye lo que contratás">
        <p>
          El alcance concreto de cada producto o servicio (duración, sesiones, materiales y canales de soporte) es el que
          se te informa por escrito antes de la compra. Ese detalle es el que manda si algo de esta página resultara más
          general.
        </p>
        <p>
          Podemos mejorar, reemplazar o reorganizar los contenidos y las herramientas mientras dure tu acceso, siempre que
          no reduzcamos el alcance de lo que contrataste.
        </p>
      </Seccion>

      <Seccion titulo="3. Precio, pagos y acceso">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>El precio, la moneda y el plan de pagos son los informados y aceptados al momento de la compra.</li>
          <li>Si elegís un plan en cuotas, te comprometés a abonarlas en las fechas acordadas.</li>
          <li>El acceso se habilita cuando se acredita el pago correspondiente.</li>
          <li>Ante cuotas impagas podemos suspender el acceso hasta regularizar la situación, avisándote antes.</li>
        </ul>
      </Seccion>

      <Seccion titulo="4. Devoluciones">
        <p>
          Las condiciones de devolución son las que se te informan y acordás por escrito al momento de la compra. Si
          tenés dudas sobre las que se aplican a tu caso, escribinos <Contacto /> antes de contratar y te las enviamos por
          escrito.
        </p>
      </Seccion>

      <Seccion titulo="5. Sin promesa de resultados">
        <p>
          <b>No garantizamos ingresos ni resultados económicos de ningún tipo.</b> Los casos de clientes que mostramos son
          resultados reales de personas concretas en su contexto, no un rendimiento esperable ni prometido para vos. Lo que
          consigas depende de tu trabajo, tu mercado, tu experiencia previa y factores que no controlamos.
        </p>
        <p>Nada de lo que publicamos constituye asesoramiento financiero, legal, contable ni de inversión.</p>
      </Seccion>

      <Seccion titulo="6. Propiedad intelectual">
        <p>
          Todo el material que entregamos (clases, grabaciones, documentos, plantillas, sistemas y comunidad) es propiedad
          de {BRAND.legalName} y se te licencia para tu uso personal mientras dure tu acceso. No podés compartirlo,
          revenderlo, publicarlo, ni usarlo para armar un producto competidor.
        </p>
        <p>
          Compartir tus credenciales o difundir el material da lugar a la baja inmediata del acceso, sin devolución, y a
          las acciones legales que correspondan.
        </p>
      </Seccion>

      <Seccion titulo="7. Convivencia y baja del acceso">
        <p>
          Esperamos respeto en todos nuestros canales. Podemos dar de baja el acceso, sin devolución, ante hostigamiento,
          discriminación, spam a otros clientes, suplantación de identidad o uso de lo contratado para actividades
          ilegales.
        </p>
      </Seccion>

      <Seccion titulo="8. Grabación de las llamadas">
        <p>
          Las llamadas comerciales y de acompañamiento pueden grabarse para dejar registro y mejorar el servicio. Te
          avisamos al inicio de cada llamada y podés pedir que no se grabe.
        </p>
      </Seccion>

      <Seccion titulo="9. Datos personales">
        <p>
          El tratamiento de tus datos está explicado en nuestra{" "}
          <a className="font-semibold text-blue-600 underline underline-offset-2 dark:text-blue-400" href="/privacidad">política de privacidad</a>, y podés
          pedir su eliminación siguiendo estas{" "}
          <a className="font-semibold text-blue-600 underline underline-offset-2 dark:text-blue-400" href="/eliminar-datos">instrucciones</a>.
        </p>
      </Seccion>

      <Seccion titulo="10. Herramientas internas">
        <p>
          Nuestro sistema de gestión y la aplicación de Meta del negocio son de uso interno del equipo. No están
          disponibles para terceros y solo leen información de nuestras propias cuentas y de las conversaciones que las
          personas inician con nosotros.
        </p>
      </Seccion>

      <Seccion titulo="11. Cambios y contacto">
        <p>
          Podemos actualizar estas condiciones; la versión vigente es siempre la publicada en esta página, con su fecha.
          Los cambios no afectan el alcance de algo ya contratado. Consultas: escribinos <Contacto />.
        </p>
        <p>Ante cualquier diferencia, nos comprometemos a buscar primero una solución de buena fe entre las partes.</p>
      </Seccion>
    </main>
  )
}
