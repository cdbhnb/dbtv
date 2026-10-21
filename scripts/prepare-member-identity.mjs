// Additive preflight. Never drops columns, resets accounts or accepts data loss.
export async function prepareMemberIdentity(db, provider) {
  const mysql=provider==='mysql';
  const table=mysql?'`User`':'"User"', column=mysql?'`memberNo`':'"memberNo"';
  let columns;
  if(provider==='sqlite') columns=await db.$queryRawUnsafe('PRAGMA table_info("User")');
  else if(mysql) columns=await db.$queryRawUnsafe("SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='User'");
  else columns=await db.$queryRawUnsafe("SELECT column_name AS name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='User'");
  if(!columns.length)return;
  const hasColumn=columns.some(row=>row.name==='memberNo');
  if(hasColumn){
    const duplicates=await db.$queryRawUnsafe(`SELECT ${column} FROM ${table} WHERE ${column} IS NOT NULL GROUP BY ${column} HAVING COUNT(*)>1 LIMIT 1`);
    if(duplicates.length)throw Error('会员号存在重复，升级已停止');
  }else await db.$executeRawUnsafe(`ALTER TABLE ${table} ADD COLUMN ${column} ${mysql?'VARCHAR(191)':'TEXT'}`);
  let indexes;
  if(provider==='sqlite')indexes=await db.$queryRawUnsafe('PRAGMA index_list("User")');
  else if(mysql)indexes=(await db.$queryRawUnsafe('SHOW INDEX FROM `User`')).map(row=>({name:row.Key_name}));
  else indexes=await db.$queryRawUnsafe("SELECT indexname AS name FROM pg_indexes WHERE schemaname=current_schema() AND tablename='User'");
  if(!indexes.some(row=>row.name==='User_memberNo_key'))await db.$executeRawUnsafe(`CREATE UNIQUE INDEX ${mysql?'`User_memberNo_key`':'"User_memberNo_key"'} ON ${table} (${column})`);
}
