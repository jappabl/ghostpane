// Sign the packed macOS app with our stable self-signed identity so the app's
// designated requirement (cert-based) stays constant across rebuilds — macOS then
// keeps the Screen Recording grant instead of wiping it every update. electron-
// builder skips self-signed (untrusted) identities, so we sign here directly.
const { execFileSync } = require('child_process')
const path = require('path')

const IDENTITY = 'Ghostpane Local Signing'

function shouldRequireSigning(env) {
  return env.CI === 'true' || env.GHOSTPANE_REQUIRE_SIGNING === '1'
}

exports.shouldRequireSigning = shouldRequireSigning

function codesignArgs(target, deep = false) {
  return [
    '--force', ...(deep ? ['--deep'] : []), '--timestamp=none',
    '--sign', IDENTITY, target
  ]
}

exports.codesignArgs = codesignArgs

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  const helper = path.join(app, 'Contents', 'Resources', 'native', 'ghostpane-helper')
  const required = shouldRequireSigning(process.env)

  let identityFound = false
  try {
    const ids = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' })
    identityFound = ids.includes(`"${IDENTITY}"`)
  } catch (error) {
    if (required) throw new Error(`afterPack: could not inspect signing identities: ${error.message}`)
  }

  if (!identityFound) {
    const message = `afterPack: identity "${IDENTITY}" not found`
    if (required) throw new Error(message)
    console.log(`${message} — leaving local development app unsigned`)
    return
  }

  console.log(`afterPack: signing ${app} with "${IDENTITY}"`)
  execFileSync('codesign', codesignArgs(helper), { stdio: 'inherit' })
  execFileSync('codesign', codesignArgs(app, true), { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' })
}
