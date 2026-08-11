import { describe, it, expect } from 'vitest'
import { errMsg } from './errors'

describe('errMsg', () => {
  it('strips the Electron invoke prefix', () => {
    expect(errMsg(new Error("Error invoking remote method 'cluster:nodes': boom"))).toBe('boom')
  })

  it('unwraps a Weaviate status-code error down to the server message', () => {
    const raw =
      "Error invoking remote method 'cluster:listReplications': " +
      'WeaviateUnexpectedStatusCodeError: The request to Weaviate failed with status code: 405 ' +
      'and message: {"code":405,"message":"method GET is not allowed, but [POST,DELETE] are"}'
    expect(errMsg(new Error(raw))).toBe(
      'Weaviate returned 405: method GET is not allowed, but [POST,DELETE] are'
    )
  })

  it('handles the GraphQL-style error array body', () => {
    const raw =
      'WeaviateUnexpectedStatusCodeError: The request to Weaviate failed with status code: 422 ' +
      'and message: {"error":[{"message":"invalid property"}]}'
    expect(errMsg(new Error(raw))).toBe('Weaviate returned 422: invalid property')
  })

  it('keeps the status when the body is empty', () => {
    const raw = 'The request to Weaviate failed with status code: 501 and message: '
    expect(errMsg(new Error(raw))).toBe('Weaviate returned 501')
  })

  it('reduces an RBAC refusal to who was denied what', () => {
    const raw =
      'Forbidden: {"error":[{"message":"rbac: authorization, forbidden action: user \'windows\' ' +
      'has insufficient permissions to create_users [[Domain: users, User: sam-service]]"}]}'
    expect(errMsg(new Error(raw))).toBe("User 'windows' lacks permission to create_users.")
  })

  it('names the collection, and says it once, when the denial repeats itself', () => {
    const detail =
      "rbac: authorization, forbidden action: user 'windows' has insufficient permissions to " +
      'update_data [[Domain: data, Collection: SampleWebsites, Tenant: *, ' +
      'Object: 01214c58-4a77-4204-9d47-f89fca8f453d]]'
    const raw = `Forbidden: {"error":[{"message":"msg:${detail} code:403 err:${detail}"}]}`
    expect(errMsg(new Error(raw))).toBe(
      "User 'windows' lacks permission to update_data on SampleWebsites."
    )
  })

  it('leaves the scope off when the denial covers every collection', () => {
    const raw =
      "rbac: authorization, forbidden action: user 'sam' has insufficient permissions to " +
      'delete_data [[Domain: data, Collection: *, Tenant: *]]'
    expect(errMsg(new Error(raw))).toBe("User 'sam' lacks permission to delete_data.")
  })

  it('unwraps a Forbidden body that is not an RBAC denial', () => {
    const raw = 'Forbidden: {"error":[{"message":"anonymous access is disabled"}]}'
    expect(errMsg(new Error(raw))).toBe('Forbidden: anonymous access is disabled')
  })

  it('passes through plain messages and non-errors', () => {
    expect(errMsg(new Error('no such collection'))).toBe('no such collection')
    expect(errMsg('just a string')).toBe('just a string')
    expect(errMsg(undefined)).toBe('undefined')
  })
})
