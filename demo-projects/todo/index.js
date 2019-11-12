const { Keystone } = require('@keystonejs/keystone');
const { KnexAdapter } = require('@keystonejs/adapter-knex');
const { MongooseAdapter } = require('@keystonejs/adapter-mongoose');
const { Relationship, Text } = require('@keystonejs/fields');
const { GraphQLApp } = require('@keystonejs/app-graphql');
const { AdminUIApp } = require('@keystonejs/app-admin-ui');
const { StaticApp } = require('@keystonejs/app-static');

const keystone = new Keystone({
  name: 'Keystone To-Do List',
  // adapter: new KnexAdapter({
  //   knexOptions: { connection: 'postgres://keystone5:k3yst0n3@localhost:5432/keystone' },
  // }),
  adapter: new MongooseAdapter(),
});

keystone.createList('Foo', {
  fields: {
    name: { type: Text },
    // No reference
    a: { type: Relationship, ref: 'Bar' }, // 1:N
    b: { type: Relationship, ref: 'Bar', many: true }, // N:N

    // With reference
    c: { type: Relationship, ref: 'Bar.w' }, // 1:1
    d: { type: Relationship, ref: 'Bar.x', many: true }, // 1:N
    e: { type: Relationship, ref: 'Bar.y' }, // N:1
    f: { type: Relationship, ref: 'Bar.z', many: true }, // N:N
  },
});

keystone.createList('Bar', {
  fields: {
    name: { type: Text },
    // With reference
    w: { type: Relationship, ref: 'Foo.c' }, // 1:1
    x: { type: Relationship, ref: 'Foo.d' }, // 1:N
    y: { type: Relationship, ref: 'Foo.e', many: true }, // N:1
    z: { type: Relationship, ref: 'Foo.f', many: true }, // N:N
  },
});

module.exports = {
  keystone,
  apps: [
    new GraphQLApp(),
    new StaticApp({ path: '/', src: 'public' }),
    // Setup the optional Admin UI
    new AdminUIApp({ enableDefaultRoute: true }),
  ],
};
