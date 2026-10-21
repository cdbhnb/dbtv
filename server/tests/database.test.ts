import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const {databaseConfig,renderSchema}=createRequire(resolve('package.json'))('./scripts/database-config.cjs');

test('database choice preserves legacy SQLite paths and allows absolute persistent paths',()=>{
  assert.deepEqual(databaseConfig({},'/app'),{provider:'sqlite',url:'file:/app/prisma/dev.db'});
  assert.equal(databaseConfig({DATABASE_URL:'file:./dev.db'},'/app').url,'file:/app/prisma/dev.db');
  assert.equal(databaseConfig({DATABASE_URL:'file:../data/dabiao.db'},'/app').url,'file:/app/data/dabiao.db');
  assert.equal(databaseConfig({DATABASE_URL:'file:/app/data/live.db'},'/app').url,'file:/app/data/live.db');
});
test('external providers are inferred, explicit mismatches fail closed without leaking credentials',()=>{
  for(const [provider,url] of [['mysql','mysql://test:secret@localhost:3306/dabiao'],['postgresql','postgresql://test:secret@localhost:5432/dabiao'],['postgresql','postgres://test:secret@localhost/dabiao']]){
    assert.equal(databaseConfig({DATABASE_URL:url}).provider,provider);
    assert.equal(databaseConfig({DATABASE_PROVIDER:provider,DATABASE_URL:url}).url,url);
    assert.throws(()=>databaseConfig({DATABASE_PROVIDER:'sqlite',DATABASE_URL:url}),e=>!String(e).includes('secret'));
  }
  for(const env of [{DATABASE_PROVIDER:'sqlserver'},{DATABASE_PROVIDER:'mysql'},{DATABASE_URL:'invalid:secret'},{DATABASE_URL:'file::memory:'},{DATABASE_URL:'file:db?mode=memory'},{DATABASE_URL:'mysql://user:secret@localhost'}]) assert.throws(()=>databaseConfig(env));
});
test('all connectors share one model schema; MySQL large content is not VARCHAR(191)',()=>{
  const source=readFileSync('prisma/schema.prisma','utf8');
  for(const provider of ['sqlite','mysql','postgresql']){
    const schema=renderSchema(source,provider);
    assert.match(schema,new RegExp(`datasource db\\s*\\{\\s*provider = "${provider}"`));
    assert.deepEqual([...schema.matchAll(/^model (\w+)/gm)].map(x=>x[1]),[...source.matchAll(/^model (\w+)/gm)].map(x=>x[1]));
    if(provider==='mysql'){
      assert.match(schema,/value\s+String\s+@db.LongText/);
      assert.match(schema,/url\s+String\s+@db.LongText/);
      assert.match(schema,/rawConfig\s+String\?\s+@db.LongText/);
      assert.match(schema,/pageAccess\s+String\s+@default\([^\n]+@db.VarChar\(2048\)/);
      assert.doesNotMatch(schema,/key\s+String[^\n]*@db.LongText/);
    }else assert.doesNotMatch(schema,/@db\./);
  }
});
test('deployment scripts do not permit destructive push; Docker persists the default database and excludes secrets',()=>{
  const command=readFileSync('scripts/database.mjs','utf8');
  assert.doesNotMatch(command,/--accept-data-loss|--force-reset/);
  assert.match(readFileSync('.dockerignore','utf8'),/^\.env$/m);
  assert.match(readFileSync('.env.example','utf8'),/DATABASE_URL="file:\.\.\/data\/dabiao.db"/);
  const compose=readFileSync('compose.yaml','utf8');
  assert.match(compose,/DATABASE_PROVIDER: \$\{DATABASE_PROVIDER:-\}/);
  assert.match(compose,/dabiao_data:\/app\/data/);
});
