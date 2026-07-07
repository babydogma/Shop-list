let items = JSON.parse(localStorage.getItem("shopping")) || [];

function save(){
localStorage.setItem("shopping", JSON.stringify(items));
}

function render(){
const list=document.getElementById("list");
list.innerHTML="";
let total=0;

items.forEach((item,index)=>{
total += Number(item.price);

list.innerHTML += `
<div class="item">
<input type="checkbox" ${item.done ? "checked":""} onchange="toggleDone(${index})">
<span class="item-name ${item.done ? "done":""}">${item.name}</span>
<span class="item-price">${item.price} ₽</span>
<span class="delete" onclick="removeItem(${index})">✕</span>
</div>`;
});

document.getElementById("total").textContent=total;
}

function addItem(){
let name=document.getElementById("item").value;
let price=document.getElementById("price").value;

if(!name)return;

items.push({name,price:price||0,done:false});
save();
render();

document.getElementById("item").value="";
document.getElementById("price").value="";
}

function toggleDone(index){
items[index].done=!items[index].done;
save();
render();
}

function removeItem(index){
items.splice(index,1);
save();
render();
}

render();
