'use strict'

const {
  codes: {
    FST_ERR_SCH_MISSING_ID,
    FST_ERR_SCH_ALREADY_PRESENT,
    FST_ERR_SCH_NOT_PRESENT
  }
} = require('./errors')

const URI_NAME_FRAGMENT = /^#[A-Za-z]{1}[\w-:.]{0,}$/

function Schemas () {
  this.store = {}
}

Schemas.prototype.add = function (schema) {
  const id = schema['$id']
  if (id === undefined) {
    throw new FST_ERR_SCH_MISSING_ID()
  }

  if (this.store[id] !== undefined) {
    throw new FST_ERR_SCH_ALREADY_PRESENT(id)
  }

  this.store[id] = schema
}

Schemas.prototype.resolve = function (id) {
  if (this.store[id] === undefined) {
    throw new FST_ERR_SCH_NOT_PRESENT(id)
  }
  return this.store[id]
}

Schemas.prototype.resolveRefs = function (routeSchemas) {
  // let's check if our schemas have a custom prototype
  for (const key of ['headers', 'querystring', 'params', 'body']) {
    if (typeof routeSchemas[key] === 'object' && Object.getPrototypeOf(routeSchemas[key]) !== Object.prototype) {
      return routeSchemas
    }
  }

  try {
    // this will work only for standard json schemas
    // other compilers such as Joi will fail
    this.traverse(routeSchemas)
    this.cleanId(routeSchemas)
  } catch (err) {
    // if we have failed because `resolve has thrown
    // let's rethrow the error and let avvio handle it
    if (/FST_ERR_SCH_*/.test(err.code)) throw err
  }

  if (routeSchemas.headers) {
    routeSchemas.headers = this.getSchemaAnyway(routeSchemas.headers)
  }

  if (routeSchemas.querystring) {
    routeSchemas.querystring = this.getSchemaAnyway(routeSchemas.querystring)
  }

  if (routeSchemas.params) {
    routeSchemas.params = this.getSchemaAnyway(routeSchemas.params)
  }

  return routeSchemas
}

Schemas.prototype.traverse = function (schema) {
  for (var key in schema) {
    // resolve the `sharedSchemaId#' only if is not a standard $ref JSON Pointer
    if (typeof schema[key] === 'string' && key !== '$schema' && key !== '$ref' && schema[key].slice(-1) === '#') {
      schema[key] = this.resolve(schema[key].slice(0, -1))
    }

    if (schema[key] !== null && typeof schema[key] === 'object') {
      this.traverse(schema[key])
    }
  }
}

Schemas.prototype.cleanId = function (schema) {
  for (var key in schema) {
    if (key === '$id' && !URI_NAME_FRAGMENT.test(schema[key])) {
      delete schema[key]
    }
    if (schema[key] !== null && typeof schema[key] === 'object') {
      this.cleanId(schema[key])
    }
  }
}

Schemas.prototype.getSchemaAnyway = function (schema) {
  if (schema.oneOf || schema.allOf || schema.anyOf) return schema
  if (!schema.type || !schema.properties) {
    return {
      type: 'object',
      properties: schema
    }
  }
  return schema
}

Schemas.prototype.getSchemas = function () {
  return Object.assign({}, this.store)
}

function buildSchemas (s) {
  const schema = new Schemas()
  const store = s.getSchemas()
  Object.keys(store).forEach(schemaKey => {
    // if the shared-schema has been used, the $id field has been removed
    if (store[schemaKey]['$id'] === undefined) {
      store[schemaKey]['$id'] = schemaKey
    }
    schema.add(store[schemaKey])
  })
  return schema
}

module.exports = { Schemas, buildSchemas }
