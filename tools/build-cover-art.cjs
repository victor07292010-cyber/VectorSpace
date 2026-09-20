// Original vector artwork. Rebuild with node tools/build-cover-art.cjs.
const fs = require('node:fs'), path = require('node:path');
const out = path.resolve(__dirname, '../game-night/assets/covers');
fs.mkdirSync(out, { recursive: true });
const ink='#202b36', paper='#fff8e9', red='#f26b50', blue='#356bf0', gold='#ffd55b', mint='#aad7bd';
const rect=(x,y,w,h,fill,r=8)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${ink}" stroke-width="3"/>`;
const circle=(x,y,r,fill)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${ink}" stroke-width="3"/>`;
const line=(d,color=ink,width=4)=>`<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const text=(x,y,t,size=30,fill=ink)=>`<text x="${x}" y="${y}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${size}" font-weight="900" fill="${fill}">${t}</text>`;
const group=(x,y,angle,content)=>`<g transform="translate(${x} ${y}) rotate(${angle})">${content}</g>`;
function card(x,y,a,value,suit,color=paper){return group(x,y,a,rect(4,7,76,106,ink)+rect(0,0,76,106,color)+text(15,25,value,20,color===paper?ink:paper)+text(38,76,suit,42,color===paper?red:paper));}
function die(x,y,a,n,color=paper){let points={1:[[0,0]],2:[[-17,-17],[17,17]],3:[[-17,-17],[0,0],[17,17]],4:[[-17,-17],[17,-17],[-17,17],[17,17]],5:[[-17,-17],[17,-17],[0,0],[-17,17],[17,17]],6:[[-17,-19],[17,-19],[-17,0],[17,0],[-17,19],[17,19]]}[n];return group(x,y,a,rect(-29,-25,64,64,ink,13)+rect(-32,-32,64,64,color,13)+points.map(([x,y])=>`<circle cx="${x}" cy="${y}" r="5" fill="${ink}"/>`).join(''));}
const burst=(x,y)=>line(`M${x-10} ${y}h20 M${x} ${y-10}v20 M${x-7} ${y-7}l14 14 M${x-7} ${y+7}l14-14`,ink,2);
function portrait(x,y,c,hat=false){return group(x,y,0,rect(0,0,68,86,paper)+`<path d="M8 82q0-28 26-28t26 28" fill="${c}" stroke="${ink}" stroke-width="3"/>`+circle(34,32,19,'#e6af85')+line('M25 31h1 M42 31h1 M28 41q6 5 12 0',ink,3)+(hat?`<path d="M12 20h44M21 20V8h26v12" fill="${blue}" stroke="${ink}" stroke-width="4"/>`:line('M17 23q6-22 31-9',ink,9)));}
function board(type){let s=rect(73,25,154,142,ink,10)+rect(67,18,154,142,type==='connect'?blue:paper,10);for(let y=0;y<4;y++)for(let x=0;x<5;x++){const n=y*5+x;s+=circle(88+x*28,39+y*31,10,type==='connect'?([11,12,13,14].includes(n)?gold:[5,6,10,15,17,19].includes(n)?red:'#244db0'):(n%3===0?ink:n%3===1?paper:mint));}return group(0,0,-2,s);}
const covers={
 'solitaire':[mint,card(83,35,-14,'K','♥')+card(135,18,9,'A','♠')+burst(232,111)],
 'color-clash':[gold,card(65,38,-16,'2','2',red)+card(121,20,0,'5','5',blue)+card(176,35,15,'+2','+2',mint)],
 'crazy-eights':['#b9b1ed',card(89,31,-14,'8','♦')+card(145,27,14,'8','♠')+burst(53,118)],
 'go-fish':['#a6d9e8',card(84,22,-12,'Q','♦')+`<path d="M147 108q38-49 75-8l28-23v49l-28-19q-40 41-75 1Z" fill="${red}" stroke="${ink}" stroke-width="3"/>`+circle(201,100,3,ink)],
 'shut-box':[gold,rect(44,39,212,80,'#da9062')+Array.from({length:5},(_,i)=>rect(53+i*40,47,34,60,paper,3)+text(70+i*40,86,i+1,25)).join('')+die(113,137,-12,3)+die(186,130,12,5)],
 'pig':['#efb1bc',die(113,81,-17,5)+die(192,110,13,6)+burst(222,38)+text(66,143,'100',23)],
 'liars-dice':[red,`<path d="M81 39h86l-8 79H90Z" fill="${blue}" stroke="${ink}" stroke-width="3"/>`+die(198,119,14,5)+text(122,91,'?',42,paper)+burst(226,46)],
 'higher-lower':['#a6d9e8',card(65,36,-10,'4','♦')+card(158,27,9,'9','♣')+line('M147 120V49l-12 14M147 49l12 14',blue,8)],
 'connect-four':[gold,board('connect')],
 'reversi':[mint,board('reversi')],
 'sea-battle':['#85bdde',`<g opacity=".3">${[55,90,125].map(y=>line(`M35 ${y}H270`,paper,2)).join('')}${[70,110,150,190,230].map(x=>line(`M${x} 20V155`,paper,2)).join('')}</g><path d="M63 101h173l-32 28H88Z" fill="${ink}"/><path d="M100 96V72h82v24M131 71V42h26v29" fill="${paper}" stroke="${ink}" stroke-width="3"/>`+line('M48 141q15 12 30 0t30 0t30 0t30 0t30 0t30 0',blue,5)+circle(221,47,18,red)+line('M221 21v13M221 60v13M195 47h13M234 47h13',ink,3)],
 'spectrum':[red,`<path d="M64 131a86 86 0 0 1 172 0Z" fill="${paper}" stroke="${ink}" stroke-width="3"/><path d="M78 131a72 72 0 0 1 144 0" fill="none" stroke="${blue}" stroke-width="21"/><path d="M138 60a72 72 0 0 1 49 10" fill="none" stroke="${gold}" stroke-width="21"/>`+line('M150 131l29-58',ink,7)+circle(150,131,10,gold)+text(150,160,'TUNE IN',13)],
 'memory':['#b9b1ed',group(76,20,-6,rect(0,0,65,69,paper)+text(32,50,'✦',43,red))+group(159,29,8,rect(0,0,65,69,blue)+line('M13 12l39 43M13 28l26 28M28 12l25 27',paper,3))+group(95,94,5,rect(0,0,65,69,blue)+line('M13 12l39 43M13 28l26 28',paper,3))+group(176,107,-7,rect(0,0,65,69,paper)+text(32,50,'✦',43,red))],
 'tic-tac-toe':[mint,line('M118 29v125M177 29v125M61 69h174M61 115h174',ink,5)+line('M74 29l26 26M100 29L74 55M132 80l29 26M161 80l-29 26M192 128l27 27M219 128l-27 27',red,9)+circle(206,44,18,blue)+circle(87,91,18,blue)],
 'imposter':['#b9b1ed',portrait(55,44,mint)+portrait(173,44,red)+group(114,22,-5,rect(0,0,76,111,ink)+text(38,78,'?',69,gold))+burst(246,25)],
 'guess-who':[gold,portrait(42,26,blue)+portrait(116,49,red,true)+portrait(190,25,mint)+circle(219,137,23,paper)+text(219,147,'?',32)],
 'mafia':['#8795c8',circle(228,40,23,gold)+`<path d="M47 155V98l26-15 29 15v57M196 155V96l23-12 26 12v59" fill="${blue}" stroke="${ink}" stroke-width="3"/><path d="M91 152q6-51 60-51t61 51" fill="${ink}"/>`+circle(151,81,31,paper)+`<path d="M104 63h94M120 62l9-32h48l8 32" fill="${ink}" stroke="${ink}" stroke-width="8"/>`+line('M132 81h9M161 81h9',ink,6)],
 'pictionary':['#a6d9e8',group(74,24,-6,rect(5,6,132,129,ink)+rect(0,0,132,129,paper)+line('M22 85l22-31 18 23 25-43 22 51 M22 98h87',blue,5)+circle(35,32,9,gold))+group(214,32,24,rect(0,0,15,99,gold,2)+`<path d="M0 99l7 18 8-18" fill="${paper}" stroke="${ink}" stroke-width="3"/>`)],
 'dots-boxes':['#a6d9e8',rect(92,50,54,54,gold,0)+rect(146,104,54,54,red,0)+[0,1,2].map(y=>[0,1,2].map(x=>circle(92+x*54,50+y*54,5,ink)).join('')).join('')+line('M92 50h108v108M92 104h108M146 50v108M92 50v54',ink,5)],
 'rock-paper-scissors':[red,group(56,47,-14,rect(0,0,63,85,ink)+circle(31,43,21,gold))+group(123,26,0,rect(0,0,63,85,paper)+line('M13 23h37M13 37h37M13 51h27',blue,3))+group(190,47,14,rect(0,0,63,85,blue)+circle(21,57,9,paper)+circle(43,57,9,paper)+line('M25 49l23-33M38 49L16 16',paper,5))],
};
for(const [id,[bg,art]] of Object.entries(covers)) {
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 190" fill="none"><rect width="300" height="190" fill="${bg}"/><circle cx="150" cy="93" r="77" fill="${paper}" opacity=".17"/><path d="M17 163h28M255 27h28" stroke="${ink}" stroke-width="2" opacity=".3"/>${art}</svg>`;
 fs.writeFileSync(path.join(out,id+'.svg'),svg);
}
console.log(`Created ${Object.keys(covers).length} original SVG covers.`);
