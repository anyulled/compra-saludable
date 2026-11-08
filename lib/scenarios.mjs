import {planBasis} from './plan-review.mjs';
export function scenarioBasis(data){return JSON.stringify([planBasis(data),data.planLocks||[]]);}
export const scenarios=[{id:'base',label:'Despensa y precios actuales'},{id:'noStock',label:'Sin existencias'},{id:'higherPrices',label:'Precios un 10 % más altos'}];
export function makeScenario(data,id) {
 if(!scenarios.some(x=>x.id===id)) throw new Error('Escenario desconocido.');
 return {...data,products:data.products.map(p=>({...p,stock:id==='noStock'?0:p.stock,price:id==='higherPrices'?Math.round(p.price*110)/100:p.price})),locks:data.planLocks||[]};
}
export function summarizeScenario(result,recipes){
 const cost=result.shopping.reduce((n,item)=>n+item.packages*item.price,0);
 const sodium=[0,0];for(const item of result.plan){const recipe=recipes.find(r=>r.id===item.recipeId);if(!recipe||!Number.isFinite(recipe.sodiumMg))throw new Error('Falta sodio para resumir el escenario.');for(let i=0;i<2;i++)sodium[i]+=recipe.sodiumMg*item.portions[i];}
 return {cost,sodiumDaily:sodium.map(n=>n/14),leftovers:result.leftovers.length};
}
