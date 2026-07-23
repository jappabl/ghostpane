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

function signApp(app, helper, runner = execFileSync) {
  runner('codesign', codesignArgs(helper), { stdio: 'inherit' })
  runner('codesign', codesignArgs(app, true), { stdio: 'inherit' })
  runner('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' })
}

exports.signApp = signApp

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  const helper = path.join(app, 'Contents', 'Resources', 'native', 'ghostpane-helper')
  const required = shouldRequireSigning(process.env)

  console.log(`afterPack: signing ${app} with "${IDENTITY}"`)
  try {
    signApp(app, helper)
  } catch (error) {
    const message = `afterPack: signing with "${IDENTITY}" failed: ${error.message}`
    if (required) throw new Error(message)
    console.log(`${message} — leaving local development app unsigned`)
  }
}
