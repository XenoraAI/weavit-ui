import { describe, it, expect } from 'vitest'
import { unavailableReason } from './backup'

// The distinction that matters: a backend the server has no module for is a
// configuration answer the UI should explain, while anything else is a real
// failure that must keep surfacing as one.
describe('unavailableReason', () => {
  it('recognises the 422 the server sends for a disabled backend', () => {
    const e = new Error(
      'WeaviateUnexpectedStatusCodeError: The request to Weaviate failed with status code: 422 and message: {"error":[{"message":"no backup backend \\"s3\\", did you enable the right module?"}]}'
    )
    expect(unavailableReason(e)).toMatch(/not enabled on the server/)
  })

  it('matches regardless of case', () => {
    expect(unavailableReason(new Error('No Backup Backend found'))).toBeDefined()
  })

  it('recognises an unknown backend', () => {
    expect(unavailableReason(new Error('unknown backup backend: azure'))).toMatch(
      /does not recognise/
    )
  })

  it('accepts a bare string as well as an Error', () => {
    expect(unavailableReason('no backup backend')).toBeDefined()
  })

  it('leaves auth failures alone', () => {
    expect(unavailableReason(new Error('status code: 401 unauthorized'))).toBeUndefined()
  })

  it('leaves a transport failure alone', () => {
    expect(unavailableReason(new Error('connect ECONNREFUSED 127.0.0.1:8080'))).toBeUndefined()
  })

  it('does not swallow a failure that merely mentions backups', () => {
    expect(
      unavailableReason(new Error('backup "nightly" already exists at "/tmp/backups/nightly"'))
    ).toBeUndefined()
  })

  it('does not swallow a storage permission error from a configured backend', () => {
    expect(
      unavailableReason(new Error('backup backend returned: AccessDenied writing to bucket'))
    ).toBeUndefined()
  })
})
