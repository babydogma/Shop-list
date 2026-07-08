let items = JSON.parse(localStorage.getItem("shopping")) || [];
let archive = JSON.parse(localStorage.getItem("shoppingArchive")) || [];


// сохранение

function saveData() {

    localStorage.setItem(
        "shopping",
        JSON.stringify(items)
    );

    localStorage.setItem(
        "shoppingArchive",
        JSON.stringify(archive)
    );

}



// отрисовка списка

function render() {

    const list = document.getElementById("list");

    list.innerHTML = "";

    let total = 0;


    items.forEach((item, index) => {


        if (!item.done) {

            total += Number(item.price);

        }


        list.innerHTML += `

        <div class="item">


            <input 
                type="checkbox"
                ${item.done ? "checked" : ""}
                onchange="toggleDone(${index})"
            >


            <span class="item-name ${item.done ? "done" : ""}">
                ${item.name}
            </span>


            <span class="item-price">
                ${item.price} ₽
            </span>


            <span 
                class="delete"
                onclick="removeItem(${index})"
            >
                ×
            </span>


        </div>

        `;

    });



    document.getElementById("total").textContent = total;



    renderArchive();

}




// добавить товар

function addItem() {


    const name =
        document.getElementById("item").value.trim();


    const price =
        document.getElementById("price").value;



    if (!name) return;



    items.push({

        name: name,

        price: Number(price) || 0,

        done: false

    });



    saveData();

    render();



    document.getElementById("item").value = "";

    document.getElementById("price").value = "";

}



// чекбокс

function toggleDone(index) {


    items[index].done =
        !items[index].done;


    saveData();

    render();

}



// удалить

function removeItem(index) {


    items.splice(index, 1);


    saveData();

    render();

}



// завершить покупки

function finishShopping() {


    if (items.length === 0) {

        return;

    }



    archive.push({

        date: new Date().toLocaleString(),

        products: items

    });



    items = [];


    saveData();

    render();

}



// архив

function renderArchive() {


    const box =
        document.getElementById("archive-list");


    if (!box) return;



    box.innerHTML = "";



    archive.forEach((shop) => {


        let products = "";



        shop.products.forEach(item => {


            products += `

            <div class="archive-item">

                ${item.name}
                —
                ${item.price} ₽

            </div>

            `;


        });



        box.innerHTML += `

        <div class="archive-block">


            <strong>
                ${shop.date}
            </strong>


            ${products}


        </div>

        `;


    });


}



// запуск

render();
