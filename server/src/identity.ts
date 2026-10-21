import {randomBytes} from 'node:crypto';

export const MIN_PASSWORD_LENGTH=6;
export const MAX_PASSWORD_LENGTH=128;
export const validPassword=(value:unknown)=>typeof value==='string'&&value.length>=MIN_PASSWORD_LENGTH&&value.length<=MAX_PASSWORD_LENGTH;
export const newMemberNo=()=>`DTV-${randomBytes(6).toString('hex').toUpperCase()}`;

// The unique index is authoritative. Random collisions retry without changing an existing number.
export async function ensureMemberNumber(db:any,id:number){
  for(let attempt=0;attempt<8;attempt++){
    const user=await db.user.findUnique({where:{id},select:{memberNo:true}});
    if(!user)throw Error('账号不存在');
    if(user.memberNo)return user.memberNo as string;
    const memberNo=newMemberNo();
    try{const changed=await db.user.updateMany({where:{id,memberNo:null},data:{memberNo}});if(changed.count)return memberNo;}
    catch(error:any){if(error.code!=='P2002')throw error;}
  }
  throw Error('会员号生成繁忙，请重试');
}
export async function backfillMemberNumbers(db:any){
  for(;;){const rows=await db.user.findMany({where:{memberNo:null},select:{id:true},take:100});if(!rows.length)return;for(const row of rows)await ensureMemberNumber(db,row.id);}
}
export async function createAccount(db:any,data:any){
  for(let attempt=0;attempt<8;attempt++){
    try{return await db.user.create({data:{...data,memberNo:newMemberNo()}})}
    catch(error:any){
      const target=JSON.stringify(error.meta?.target||'');
      if(error.code!=='P2002'||!target.includes('memberNo'))throw error;
    }
  }
  throw Error('会员号生成繁忙，请重试');
}

export function accountSearchWhere(query:string){const q=query.trim().slice(0,80);return q?{OR:[{username:{contains:q}},{displayName:{contains:q}},{memberNo:{contains:q.toUpperCase()}}]}:{};}
