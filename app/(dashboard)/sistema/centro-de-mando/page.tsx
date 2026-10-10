"use client"

import { useState } from "react"
import Vista from "@/components/os/pages/CommandCenter"
import type { AgentId } from "@/components/os/data"
import { OsShell } from "@/components/os-shell"

export default function Page() {
  const [agent, setAgent] = useState<AgentId>("ceo")
  return <OsShell><Vista agent={agent} setAgent={setAgent} /></OsShell>
}
