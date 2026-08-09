// electron-builder `afterPack` hook — ad-hoc code signing for macOS builds.
//
// Why this exists: we ship unsigned community builds (no Apple Developer ID),
// so `CSC_IDENTITY_AUTO_DISCOVERY=false` makes electron-builder skip signing
// entirely. That leaves the bundle carrying the *linker-signed* ad-hoc
// signature of the stock Electron binary, which no longer matches the bundle
// after electron-builder renames it, swaps the Info.plist and adds app.asar.
// On Apple Silicon an invalid signature plus the download quarantine flag is a
// hard failure: macOS refuses to launch with "the app is damaged and can't be
// opened". (Intel is lenient and only shows the milder unidentified-developer
// prompt, which is why this went unnoticed.)
//
// Re-signing ad-hoc makes the signature valid again. The app is still not
// notarized, so users get the normal unidentified-developer prompt and open it
// via right-click -> Open (see README), but it is no longer "damaged".
//
// Once real Developer ID certs are configured, electron-builder signs the app
// itself and this hook steps aside (see the CSC_* check below).

const { execFileSync } = require('child_process')
const path = require('path')

module.exports = async function adhocSignMac(context) {
  const { electronPlatformName, appOutDir, packager } = context

  if (electronPlatformName !== 'darwin') return

  // `codesign` only exists on macOS hosts; cross-builds can't do this.
  if (process.platform !== 'darwin') {
    console.warn('  • skipping ad-hoc signing  reason=not building on macOS')
    return
  }

  // If real signing credentials are present, electron-builder's own signing
  // step runs right after this hook — don't stomp on a Developer ID signature.
  if (process.env.CSC_LINK || process.env.CSC_NAME) {
    console.log('  • skipping ad-hoc signing  reason=real signing identity configured')
    return
  }

  const appPath = path.join(appOutDir, `${packager.appInfo.productFilename}.app`)

  console.log(`  • ad-hoc signing  app=${appPath}`)
  // --deep is deprecated for distribution signing but is the supported way to
  // ad-hoc sign a nested bundle (helpers + frameworks) in one pass.
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit',
  })
  // Fail the build rather than ship another "damaged" app.
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], {
    stdio: 'inherit',
  })
}
