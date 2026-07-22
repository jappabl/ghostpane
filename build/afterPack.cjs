// Sign the packed macOS app with our stable self-signed identity so the app's
// designated requirement (cert-based) stays constant across rebuilds — macOS then
// keeps the Screen Recording grant instead of wiping it every update. electron-
// builder skips self-signed (untrusted) identities, so we sign here directly.
const { execSync } = require('child_process')
const path = require('path')

const IDENTITY = 'Ghostpane Local Signing'

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)

  // Is the identity present? If not (e.g. building on CI), skip quietly.
  try {
    const ids = execSync('security find-identity -p codesigning', { encoding: 'utf8' })
    if (!ids.includes(IDENTITY)) {
      console.log(`afterPack: identity "${IDENTITY}" not found — leaving app unsigned`)
      return
    }
  } catch {
    return
  }

  console.log(`afterPack: signing ${app} with "${IDENTITY}"`)
  execSync(`codesign --force --deep --sign "${IDENTITY}" ${JSON.stringify(app)}`, { stdio: 'inherit' })
  const dr = execSync(`codesign -dr - ${JSON.stringify(app)} 2>&1`, { encoding: 'utf8' })
  console.log('afterPack: designated requirement ->', dr.trim())
}
