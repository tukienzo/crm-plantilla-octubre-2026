"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Loader2, Upload } from "lucide-react"

// Botón para subir una imagen desde la compu (miniatura de un video largo, portada de un formato).
// Si se le pasa `id`, la ruta además la deja cargada en esa fila; si no, devuelve la URL y el
// formulario que lo usa decide qué hacer con ella.

export function SubirImagen({ destino, id, titulo, etiqueta = "Subir desde la compu", className, size = "sm", variant = "outline", full = true, onSubido }: {
  destino: "youtube" | "formato"
  id?: string
  titulo?: string
  etiqueta?: string
  className?: string
  size?: "sm" | "default"
  variant?: "outline" | "ghost" | "default" | "secondary"
  full?: boolean
  onSubido: (url: string) => void | Promise<void>
}) {
  const input = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState("")

  async function elegida(archivo: File | undefined) {
    if (!archivo) return
    setSubiendo(true); setError("")
    try {
      const form = new FormData()
      form.set("file", archivo)
      form.set("destino", destino)
      if (id) form.set("id", id)
      if (titulo) form.set("titulo", titulo)
      const r = await fetch("/api/imagen", { method: "POST", body: form })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || "No se pudo subir la imagen")
      await onSubido(j.url)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubiendo(false)
      if (input.current) input.current.value = ""   // así se puede volver a elegir el mismo archivo
    }
  }

  return (
    <div className={cn("space-y-1", className)}>
      <input
        ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" hidden
        onChange={(e) => elegida(e.target.files?.[0])}
      />
      <Button type="button" size={size} variant={variant} disabled={subiendo} onClick={() => input.current?.click()} className={cn(full ? "w-full" : "h-7 px-2 text-xs")}>
        {subiendo ? <Loader2 className={cn("animate-spin", full ? "mr-2 h-4 w-4" : "mr-1 h-3.5 w-3.5")} /> : <Upload className={cn(full ? "mr-2 h-4 w-4" : "mr-1 h-3.5 w-3.5")} />}
        {subiendo ? "Subiendo…" : etiqueta}
      </Button>
      {error ? <p className="text-[11px] font-semibold text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  )
}
