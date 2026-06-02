
const canvas=document.getElementById('game');
const ctx=canvas.getContext('2d');
canvas.width=innerWidth;canvas.height=innerHeight;
const menu=document.getElementById('menu');
document.getElementById('startBtn').onclick=()=>{
 menu.style.display='none';
 canvas.style.display='block';
 startGame();
};

function startGame(){
 let player={x:200,y:200,hp:100};
 let truck={x:canvas.width/2,y:canvas.height/2,hp:500};
 let enemies=[];
 let wave=1;

 function spawn(){
   for(let i=0;i<wave+4;i++){
     enemies.push({x:Math.random()*canvas.width,y:-50,hp:10});
   }
 }

 spawn();

 canvas.addEventListener('touchmove',e=>{
   let t=e.touches[0];
   player.x=t.clientX; player.y=t.clientY;
 });

 canvas.addEventListener('mousemove',e=>{
   player.x=e.clientX; player.y=e.clientY;
 });

 function loop(){
   ctx.clearRect(0,0,canvas.width,canvas.height);

   ctx.fillStyle='black';
   ctx.fillRect(truck.x-40,truck.y-20,80,40);

   ctx.fillStyle='lime';
   ctx.fillRect(player.x-10,player.y-10,20,20);

   ctx.fillStyle='red';
   enemies.forEach(en=>{
      let dx=truck.x-en.x;
      let dy=truck.y-en.y;
      let d=Math.hypot(dx,dy)||1;
      en.x+=dx/d;
      en.y+=dy/d;

      if(d<30){truck.hp-=0.05;}
      ctx.fillRect(en.x,en.y,16,16);
   });

   if(enemies.length<2){
      wave++;
      spawn();
   }

   ctx.fillStyle='white';
   ctx.fillText('Wave '+wave,20,20);
   ctx.fillText('Truck HP '+Math.floor(truck.hp),20,40);

   requestAnimationFrame(loop);
 }
 loop();
}
