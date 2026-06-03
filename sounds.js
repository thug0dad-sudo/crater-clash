window.SFX = (() => {
  let ctx, flight;
  function ac(){ctx ||= new (window.AudioContext || window.webkitAudioContext)(); if(ctx.state==="suspended") ctx.resume(); return ctx;}
  function tone(f,d,type="square",v=.08){const c=ac(),o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.value=f;g.gain.setValueAtTime(v,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+d);o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+d);}
  function noise(d=.2,v=.1){const c=ac(),b=c.createBuffer(1,c.sampleRate*d,c.sampleRate),data=b.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;const s=c.createBufferSource(),g=c.createGain();g.gain.setValueAtTime(v,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+d);s.buffer=b;s.connect(g);g.connect(c.destination);s.start();}
  return {
    unlock: ac,
    play(n){if(n==="launch"){tone(100,.2,"sawtooth",.14);noise(.1,.1)} if(n==="boom"){clearInterval(flight);noise(.5,.22);tone(60,.35,"sawtooth",.16)} if(n==="hit"){tone(180,.08,"square",.12);noise(.08,.1)} if(n==="beep")tone(440,.1,"sine",.08);},
    flight(){clearInterval(flight);flight=setInterval(()=>{noise(.06,.035);tone(300,.04,"sine",.02)},150);setTimeout(()=>clearInterval(flight),3500);}
  };
})();
document.addEventListener("pointerdown",()=>SFX.unlock(),{once:true});
