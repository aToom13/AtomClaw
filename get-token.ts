/**
 * src/scripts/get-token.ts
 * Kilocode Device Auth akışını çalıştırarak KILOCODE_TOKEN elde etmeyi sağlar.
 * Raspberry Pi üzerinde SSH ile çalıştırılıyorsa, ekranda beliren linke
 * ana makinenizden tıklayarak auth olabilirsiniz.
 */

const KILOCODE_API_BASE_URL = "https://api.kilo.ai"
const POLL_INTERVAL_MS = 3000

interface AuthInit {
  code: string
  verificationUrl: string
  expiresIn: number
}

interface AuthPoll {
  status: "pending" | "approved" | "denied" | "expired"
  token?: string
  userEmail?: string
}

async function initiateDeviceAuth(): Promise<AuthInit> {
  const response = await fetch(`${KILOCODE_API_BASE_URL}/api/device-auth/codes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })
  
  if (!response.ok) throw new Error("Link oluşturulamadı!")
  return (await response.json()) as AuthInit
}

async function pollDeviceAuth(code: string): Promise<AuthPoll> {
  const response = await fetch(`${KILOCODE_API_BASE_URL}/api/device-auth/codes/${code}`)
  
  if (response.status === 202) return { status: "pending" }
  if (response.status === 403) return { status: "denied" }
  if (response.status === 410) return { status: "expired" }
  
  if (!response.ok) throw new Error("Doğrulama kontrolünde hata oluştu.")
  return (await response.json()) as AuthPoll
}

async function main() {
  console.log("🔐 Kilocode Authentication başlatılıyor...\n")
  
  const { code, verificationUrl, expiresIn } = await initiateDeviceAuth()
  
  console.log("Aşağıdaki linke bilgisayarınızdan/telefonunuzdan tıklayın:")
  console.log(`🔗 \x1b[36m${verificationUrl}\x1b[0m\n`)
  console.log(`Doğrulama Kodu: \x1b[33m${code}\x1b[0m`)
  console.log("\nBekleniyor... ⏳")

  for (let i = 0; i < expiresIn; i += (POLL_INTERVAL_MS / 1000)) {
    const poll = await pollDeviceAuth(code)
    
    if (poll.status === "approved" && poll.token) {
      console.log(`\n✅ Başarıyla giriş yapıldı: ${poll.userEmail}`)
      console.log("\n🔑 KILOCODE_TOKEN'ınız oluşturuldu:")
      console.log(`\x1b[32m${poll.token}\x1b[0m\n`)
      console.log("👆 Bu token'ı kopyalayıp .env dosyanızdaki KILOCODE_TOKEN= karşısına yapıştırın.")
      return
    }
    
    if (poll.status === "denied") {
      console.error("\n❌ Giriş reddedildi.")
      return
    }
    
    if (poll.status === "expired") {
      console.error("\n⏳ Süre doldu. Tekrar deneyin.")
      return
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
  }
}

main().catch(console.error)
