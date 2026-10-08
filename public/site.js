(() => {
  const toggle=document.querySelector('.mobile-toggle');
  const nav=document.querySelector('.navlinks');
  if(toggle&&nav){toggle.addEventListener('click',()=>nav.classList.toggle('open'));}
  const form=document.querySelector('#enquiryForm');
  if(form){form.addEventListener('submit',async(e)=>{e.preventDefault();const fd=new FormData(form);const data=Object.fromEntries(fd.entries());const btn=form.querySelector('button[type=submit]');const notice=form.querySelector('.notice');btn.disabled=true;btn.textContent='Sending…';try{const r=await fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(!r.ok)throw new Error();notice.style.display='block';notice.textContent='Thank you. Your enquiry has been received.';form.reset();}catch{notice.style.display='block';notice.style.background='#2a1111';notice.style.color='#ffc1c1';notice.textContent='Could not send right now. Please call or WhatsApp us.'}finally{btn.disabled=false;btn.textContent='Send Enquiry';}})}
})();
