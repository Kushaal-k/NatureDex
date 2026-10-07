// Hand-drawn pixel illustrations. Run: node scripts/pixel-specimens.mjs
// All shapes are drawn directly on an integer grid; no image downsampling.
import { mkdir, writeFile } from 'node:fs/promises';
const W=96,H=80;
const C={ink:'#263e36',green:'#447249',leaf:'#72a653',light:'#bad078',cream:'#fff2c7',gold:'#e6b849',ochre:'#b97934',brown:'#765039',bark:'#a27951',dark:'#302d34',white:'#fff9e5',blue:'#296c89',teal:'#389b99',pale:'#bedfd4'};
let pixels;
const dot=(x,y,c)=>{x=Math.round(x);y=Math.round(y);if(x>=0&&x<W&&y>=0&&y<H)pixels[y*W+x]=c;};
function rect(x,y,w,h,c){for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)dot(xx,yy,c);}
function ellipse(cx,cy,rx,ry,c){for(let y=Math.ceil(cy-ry);y<=cy+ry;y++)for(let x=Math.ceil(cx-rx);x<=cx+rx;x++)if(((x-cx)/rx)**2+((y-cy)/ry)**2<=1)dot(x,y,c);}
function poly(points,c){for(let y=0;y<H;y++)for(let x=0;x<W;x++){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const[a,b]=points[i],[d,e]=points[j];if((b>y)!==(e>y)&&x<(d-a)*(y-b)/(e-b)+a)inside=!inside;}if(inside)dot(x,y,c);}}
function line(x0,y0,x1,y1,c,width=1){const n=Math.max(1,Math.abs(x1-x0),Math.abs(y1-y0));for(let i=0;i<=n;i++)rect(Math.round(x0+(x1-x0)*i/n),Math.round(y0+(y1-y0)*i/n),width,width,c);}
function leaf(x,y,dx,dy,size=5,colour=C.leaf){const len=Math.hypot(dx,dy),nx=-dy/len*size,ny=dx/len*size;
  poly([[x,y],[x+dx*.45+nx,y+dy*.45+ny],[x+dx,y+dy],[x+dx*.45-nx,y+dy*.45-ny]],C.ink);
  poly([[x,y],[x+dx*.48+nx*.75,y+dy*.48+ny*.75],[x+dx,y+dy],[x+dx*.5-nx*.65,y+dy*.5-ny*.65]],colour);line(x,y,x+dx*.85,y+dy*.85,C.light);
}
function ground(){ellipse(48,69,31,3,'#d8dcc0');}
function branch(){poly([[13,64],[82,59],[84,62],[14,68]],C.brown);line(19,64,77,60,C.bark);leaf(73,61,10,-7,3);}
function eye(x,y){rect(x-1,y-1,4,4,C.dark);dot(x,y,C.white);}
function compound(kind){ground();line(48,68,48,17,C.ink,2);const neem=kind==='neem';
  for(let i=0;i<5;i++){const y=26+i*8,dx=neem?25:18,dy=neem?-12:-10;leaf(49,y,-dx,dy,neem?4:6,i%2?C.green:C.leaf);leaf(49,y,dx,dy,neem?4:6,i%2?C.leaf:C.green);
    if(neem)for(let t=1;t<4;t++){const xx=Math.round(t*dx/4),yy=Math.round(y+t*dy/4);dot(49-xx,yy+3,C.cream);dot(49+xx,yy+3,C.cream);}}
  leaf(49,22,0,-14,5);if(!neem){ellipse(68,53,3,3,C.dark);ellipse(74,49,3,3,C.dark);dot(67,52,'#717296');dot(73,48,'#717296');}
}
function fig(){ground();line(46,68,52,40,C.brown,2);
  poly([[49,24],[39,17],[27,19],[20,29],[22,40],[31,50],[42,57],[48,70],[53,56],[66,47],[75,33],[71,22],[61,17],[53,21]],C.ink);
  poly([[49,28],[38,21],[29,23],[24,30],[26,39],[34,47],[44,54],[49,63],[52,53],[63,45],[70,33],[68,25],[60,21]],C.green);
  poly([[48,29],[38,23],[28,28],[29,36],[37,45],[48,54]],C.leaf);line(49,29,49,60,C.light,2);
  for(let y=34;y<51;y+=7){line(49,y+4,31,y-5,C.light);line(50,y+4,66,y-5,C.light);}
}
function banyan(){ground();poly([[43,33],[56,33],[53,55],[60,68],[53,69],[48,60],[42,68],[34,69],[42,56]],C.brown);rect(46,35,4,22,C.bark);
  for(const x of[22,30,64,73]){line(x,32,x,65,C.brown,2);rect(x+2,37,1,24,C.bark);}
  for(const[x,y,rx,ry]of[[29,31,19,13],[48,22,22,14],[67,32,19,14],[47,35,28,13]]){ellipse(x,y,rx,ry,C.ink);ellipse(x,y-2,rx-2,ry-2,C.green);ellipse(x-5,y-5,rx-7,ry-6,C.leaf);}
  for(const[x,y]of[[19,27],[35,19],[46,13],[61,24],[70,31],[36,36]])rect(x,y,5,2,C.light);
}
function flower(kind){ground();line(48,65,48,34,C.ink,3);leaf(49,59,21,-10,6);leaf(49,52,-21,-10,6);
  if(kind==='hibiscus'){for(const[x,y]of[[48,23],[33,31],[39,46],[58,45],[63,30]]){ellipse(x,y,13,13,'#733e49');ellipse(x,y-1,11,11,'#cc5960');ellipse(x-3,y-4,6,5,'#ee8975');}
    ellipse(48,35,6,6,'#8f3948');line(49,35,66,15,C.gold,2);rect(64,13,6,3,C.ochre);for(const[x,y]of[[57,24],[61,20],[66,14],[69,12]])rect(x,y,3,3,C.cream);
  }else{for(const[x,y,r]of[[48,18,10],[35,23,10],[29,33,9],[35,44,10],[49,47,10],[62,41,10],[66,29,10],[58,20,10]]){ellipse(x,y,r,r,'#9c602c');ellipse(x,y-1,r-2,r-2,'#e89c32');}
    ellipse(48,33,19,17,C.gold);for(const[x,y]of[[38,26],[48,22],[56,28],[33,34],[43,33],[53,37],[61,35],[39,42],[48,45]]){rect(x-3,y-3,7,6,'#f8d264');rect(x-3,y+2,6,2,'#c6802e');dot(x-2,y-3,C.cream);}}
}
function butterfly(kind){const tiger=kind==='plain-tiger',lime=kind==='lime-butterfly';ground();const base=tiger?'#dc813e':lime?C.cream:'#ecd451';
  for(const sign of[-1,1]){const p=pts=>pts.map(([x,y])=>[48+sign*x,y]);
    poly(p([[1,38],[10,20],[25,12],[34,16],[36,28],[30,42],[18,49],[8,47]]),C.dark);poly(p([[3,39],[12,24],[25,17],[30,19],[31,28],[26,37],[16,43],[8,44]]),base);
    poly(p([[2,43],[18,43],[29,48],[28,60],[21,67],[11,64],[4,56]]),C.dark);poly(p([[5,46],[17,47],[24,51],[23,58],[19,62],[12,59],[7,54]]),base);
    for(const[x,y]of[[26,17],[32,23],[30,32],[24,39],[23,58],[18,64]])rect(48+sign*x-1,y,2,2,C.white);
    if(tiger){for(const[x,y]of[[25,24],[23,33],[16,39],[18,54]])line(48+sign*5,44,48+sign*x,y,'#98502f');rect(48+sign*26-1,24,3,4,C.white);}
    if(lime){for(const[x,y]of[[12,29],[19,23],[25,30],[19,36],[12,39],[15,51],[21,55]])rect(48+sign*x-2,y,5,4,C.dark);rect(48+sign*17-2,59,4,3,'#ca734b');dot(48+sign*19,58,C.blue);}
    if(!tiger&&!lime){poly(p([[14,21],[26,14],[33,18],[34,28],[28,25],[24,22]]),C.dark);line(48+sign*6,42,48+sign*22,28,'#c4a639');}}
  ellipse(48,43,3,15,C.dark);rect(47,35,2,16,C.ochre);ellipse(48,29,3,3,C.dark);line(47,28,42,21,C.dark);line(49,28,54,21,C.dark);dot(41,20,C.dark);dot(55,20,C.dark);
}
function bee(){ground();for(const[x,y,rx,ry]of[[42,25,12,16],[60,26,11,15]]){ellipse(x,y,rx,ry,C.ink);ellipse(x,y-1,rx-2,ry-2,C.pale);ellipse(x-3,y-4,rx-5,ry-6,C.white);line(x,y+10,x-4,y-9,'#92bdb0');}
  for(const[x,y,xx,yy]of[[36,51,30,61],[44,53,44,65],[55,50,62,60]]){line(x,y,xx,yy,C.dark,2);line(xx,yy,xx-5,yy+1,C.dark);}
  poly([[19,44],[12,48],[21,50]],C.dark);ellipse(39,45,22,13,C.dark);ellipse(38,43,19,10,C.gold);for(const x of[27,38,49]){rect(x,35,5,18,C.dark);rect(x+1,35,2,3,'#766346');}
  ellipse(60,42,11,11,C.dark);ellipse(63,39,4,5,C.ochre);eye(65,38);line(62,32,62,23,C.dark,2);line(62,23,58,20,C.dark,2);line(68,33,73,25,C.dark,2);rect(72,22,3,3,C.dark);rect(23,39,3,3,C.cream);
}
function bird(kind){ground();branch();const sparrow=kind==='house-sparrow',myna=kind==='common-myna',dove=kind==='spotted-dove',parrot=kind==='rose-ringed-parakeet';
  const body=parrot?C.leaf:dove?'#a79791':sparrow?'#ae8559':'#86694b',wing=parrot?C.green:dove?'#82747a':sparrow?'#795438':'#534943';
  poly([[34,44],[15,51],[19,55],[39,54]],parrot?C.teal:C.dark);if(parrot)poly([[35,47],[12,65],[11,70],[42,52]],C.green);
  line(45,52,44,62,C.ochre,2);line(57,52,58,61,C.ochre,2);line(40,63,48,62,C.dark);line(55,62,62,61,C.dark);
  ellipse(47,42,21,15,C.ink);ellipse(47,41,19,13,body);ellipse(64,27,12,13,C.ink);ellipse(64,26,10,11,parrot?C.leaf:myna?C.dark:dove?'#b8afaa':'#997048');
  ellipse(42,40,14,9,wing);poly([[29,38],[43,34],[54,40],[43,48],[35,47]],wing);for(let i=0;i<3;i++)line(32+i*5,37,38+i*5,44,parrot?C.leaf:dove?'#c1af9b':'#d6b88a');
  if(sparrow){rect(58,17,10,4,'#aaa9a0');poly([[58,27],[63,25],[72,30],[69,34],[60,34]],C.cream);poly([[61,32],[67,31],[66,42],[60,39]],C.dark);rect(36,37,13,3,C.cream);}
  if(myna){poly([[64,25],[73,24],[75,30],[66,31]],C.gold);rect(38,41,13,4,C.cream);}
  if(dove){poly([[56,30],[62,33],[65,39],[58,39],[54,34]],C.dark);for(const[x,y]of[[56,32],[59,34],[62,37],[57,36]])rect(x,y,2,2,C.white);}
  if(parrot){line(57,34,63,37,C.dark,2);line(63,37,70,33,'#d76b71',2);poly([[73,24],[81,25],[80,30],[76,33],[73,29]],'#bd4b42');rect(73,24,4,2,'#f09a63');}else poly([[74,27],[83,30],[74,33]],myna?C.gold:dove?C.dark:C.ochre);
  eye(68,25);rect(54,46,5,3,parrot?C.light:dove?'#c4b7ad':'#b39b75');
}
function peacock(){ground();
  for(const[x,y]of[[17,38],[23,25],[35,17],[48,14],[61,17],[74,25],[80,38]]){poly([[46,64],[x-7,y+7],[x-6,y-4],[x,y-8],[x+6,y-4],[x+7,y+7],[51,64]],C.ink);poly([[48,60],[x-5,y+6],[x-4,y-3],[x,y-5],[x+4,y-3],[x+5,y+6]],C.green);line(48,59,x,y,C.leaf);ellipse(x,y,4,6,C.gold);ellipse(x,y,3,4,C.teal);ellipse(x,y+1,2,2,C.blue);}
  ellipse(48,54,10,12,C.ink);ellipse(48,53,8,10,C.blue);ellipse(44,53,4,7,C.teal);rect(48,33,7,21,C.blue);ellipse(52,31,6,7,C.blue);rect(49,28,6,3,C.white);eye(53,28);poly([[58,30],[65,32],[58,34]],C.gold);
  for(const x of[48,52,56]){line(52,25,x,19,C.blue);rect(x-1,17,3,3,C.teal);}line(44,64,43,69,C.ochre,2);line(51,64,53,69,C.ochre,2);
}
function lizard(){ground();branch();poly([[40,47],[29,48],[21,44],[14,34],[11,24],[12,40],[18,50],[29,55],[44,53]],C.ink);poly([[38,49],[27,51],[18,45],[14,36],[19,48],[28,53],[39,52]],C.ochre);
  poly([[39,41],[52,34],[64,32],[74,23],[82,25],[86,34],[80,40],[66,40],[55,52],[39,52]],C.ink);poly([[40,43],[52,37],[65,35],[75,26],[80,28],[83,33],[77,37],[65,37],[55,48],[42,49]],'#aa8f4e');poly([[60,36],[68,34],[73,37],[68,45],[60,44]],'#cd7d46');line(44,45,61,39,C.light,2);
  for(const[x,y]of[[45,41],[51,37],[58,35],[65,32],[69,29]])poly([[x,y],[x+1,y-5],[x+4,y]],C.ink);
  for(const[x,y,xx,yy]of[[47,47,39,58],[58,45,65,53]]){line(x,y,xx,yy,C.ink,3);line(xx,yy,xx-2,61,C.ochre,2);line(xx-5,62,xx+3,61,C.ink);}ellipse(77,30,3,3,C.gold);eye(77,29);line(79,36,84,35,C.dark);dot(82,31,C.dark);
}
function fungus(kind){ground();poly([[16,56],[73,45],[84,54],[82,65],[21,71],[13,64]],C.brown);line(22,63,74,53,C.bark,3);line(27,67,75,58,C.dark);const turkey=kind==='turkey-tail';
  for(const[cx,cy,r]of[[32,45,20],[62,40,21],[48,56,23]]){for(const[scale,col]of turkey?[[1,C.cream],[.91,'#705747'],[.79,'#b78956'],[.65,'#ddd0a7'],[.52,'#6f7370'],[.37,'#ae8156'],[.22,C.brown]]:[[1,C.cream],[.9,'#b4a69a'],[.77,'#ece4cc']]){const pts=[[cx,cy+5]];for(let a=Math.PI;a<=Math.PI*2+.01;a+=Math.PI/24)pts.push([Math.round(cx+Math.cos(a)*r*scale),Math.round(cy+Math.sin(a)*r*.7*scale)]);poly(pts,col);}
    if(!turkey)for(let a=Math.PI+.18;a<Math.PI*2;a+=.22)line(cx,cy+2,Math.round(cx+Math.cos(a)*r*.82),Math.round(cy+Math.sin(a)*r*.56),'#a89b8d');}
}
function svg(){const paths=new Map();for(let y=0;y<H;y++)for(let x=0;x<W;){const colour=pixels[y*W+x];let end=x+1;while(end<W&&pixels[y*W+end]===colour)end++;if(colour)paths.set(colour,(paths.get(colour)||'')+`M${x} ${y}h${end-x}v1H${x}z`);x=end;}return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">${[...paths].map(([fill,d])=>`<path fill="${fill}" d="${d}"/>`).join('')}</svg>\n`;}
const drawings={neem:()=>compound('neem'),'curry-tree':()=>compound('curry'),'sacred-fig':fig,banyan,hibiscus:()=>flower('hibiscus'),marigold:()=>flower('marigold'),'plain-tiger':()=>butterfly('plain-tiger'),'lime-butterfly':()=>butterfly('lime-butterfly'),'common-grass-yellow':()=>butterfly('yellow'),'honey-bee':bee,peafowl:peacock,'garden-lizard':lizard,...Object.fromEntries(['common-myna','house-sparrow','spotted-dove','rose-ringed-parakeet'].map(id=>[id,()=>bird(id)])),'turkey-tail':()=>fungus('turkey-tail'),'split-gill':()=>fungus('split-gill'),unknown:()=>{ground();leaf(48,65,0,-48,20);}};
const output='public/pixel-specimens-v2';await mkdir(output,{recursive:true});
for(const[name,draw]of Object.entries(drawings)){pixels=Array(W*H).fill('#f2efd9');draw();await writeFile(`${output}/${name}.svg`,svg());}
console.log(`Drew ${Object.keys(drawings).length} original pixel illustrations in ${output}.`);
