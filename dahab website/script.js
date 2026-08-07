/* ==========================================================================
   مناحل دهب - ملف التفاعلية والمنطق (script.js)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

    // رقم واتساب النشاط التجاري لمناحل دهب
    const WHATSAPP_NUMBER = '201093579694';

    // حالة سلة التسوق (Cart State)
    let cartState = [];

    /* --------------------------------------------------------------------------
       1. القائمة التفاعلية للموبايل والـ Sticky Header
       -------------------------------------------------------------------------- */
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const navMenu = document.getElementById('navMenu');
    const navLinks = document.querySelectorAll('.nav-link');
    const mainHeader = document.getElementById('mainHeader');

    if (mobileMenuBtn && navMenu) {
        mobileMenuBtn.addEventListener('click', () => {
            navMenu.classList.toggle('open');
            mobileMenuBtn.classList.toggle('active');
        });

        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                navMenu.classList.remove('open');
            });
        });
    }

    window.addEventListener('scroll', () => {
        if (window.scrollY > 40) {
            mainHeader.classList.add('scrolled');
        } else {
            mainHeader.classList.remove('scrolled');
        }
        highlightNavOnScroll();
    });

    function highlightNavOnScroll() {
        const scrollPos = window.scrollY + 120;
        navLinks.forEach(link => {
            if (link.hash) {
                const section = document.querySelector(link.hash);
                if (section) {
                    if (section.offsetTop <= scrollPos && (section.offsetTop + section.offsetHeight) > scrollPos) {
                        navLinks.forEach(l => l.classList.remove('active'));
                        link.classList.add('active');
                    }
                }
            }
        });
    }

    /* --------------------------------------------------------------------------
       2. منطق تبديل أوزان المنتجات (0.5كجم / 1كجم) وحساب السعر
       -------------------------------------------------------------------------- */
    const productCards = document.querySelectorAll('.product-card');

    productCards.forEach(card => {
        const weightBtns = card.querySelectorAll('.weight-btn');
        const priceNum = card.querySelector('.price-number');

        weightBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                weightBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const newPrice = btn.getAttribute('data-price');
                priceNum.textContent = newPrice;
            });
        });
    });

    /* --------------------------------------------------------------------------
       3. فلترة المنتجات حسب الفئة (Filter Tabs)
       -------------------------------------------------------------------------- */
    const filterBtns = document.querySelectorAll('.filter-btn');

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const filterValue = btn.getAttribute('data-filter');

            productCards.forEach(card => {
                const category = card.getAttribute('data-category');
                if (filterValue === 'all' || category === filterValue) {
                    card.style.display = 'flex';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    });

    /* --------------------------------------------------------------------------
       4. إدارة سلة التسوق الجانبية (Cart Drawer System)
       -------------------------------------------------------------------------- */
    const cartTriggerBtn = document.getElementById('cartTriggerBtn');
    const cartOverlay = document.getElementById('cartOverlay');
    const closeCartBtn = document.getElementById('closeCartBtn');
    const cartBody = document.getElementById('cartBody');
    const cartEmptyMsg = document.getElementById('cartEmptyMsg');
    const cartCountBadge = document.getElementById('cartCountBadge');
    const cartTotalVal = document.getElementById('cartTotalVal');
    const checkoutWhatsappBtn = document.getElementById('checkoutWhatsappBtn');

    // فتح وإغلاق السلة
    cartTriggerBtn.addEventListener('click', () => cartOverlay.classList.add('active'));
    closeCartBtn.addEventListener('click', () => cartOverlay.classList.remove('active'));
    cartOverlay.addEventListener('click', (e) => {
        if (e.target === cartOverlay) cartOverlay.classList.remove('active');
    });

    // إضافة منتج لسلة التسوق
    productCards.forEach(card => {
        const addCartBtn = card.querySelector('.add-cart-btn');
        const whatsappDirectBtn = card.querySelector('.whatsapp-direct-btn');

        addCartBtn.addEventListener('click', () => {
            const id = card.getAttribute('data-id');
            const name = card.getAttribute('data-name');
            const activeWeightBtn = card.querySelector('.weight-btn.active');
            const weight = activeWeightBtn.getAttribute('data-weight');
            const price = parseInt(activeWeightBtn.getAttribute('data-price'), 10);

            addToCart(id, name, weight, price);
            cartOverlay.classList.add('active');
        });

        // الشراء الفوري عبر واتساب للبطاقة
        whatsappDirectBtn.addEventListener('click', () => {
            const name = card.getAttribute('data-name');
            const activeWeightBtn = card.querySelector('.weight-btn.active');
            const weight = activeWeightBtn.getAttribute('data-weight');
            const price = activeWeightBtn.getAttribute('data-price');

            const message = `مرحباً مناحل دهب 🍯، أود طلب المنتج التالي فوراً:\n\n` +
                            `• المنتج: *${name}*\n` +
                            `• الوزن: *${weight}*\n` +
                            `• السعر: *${price} جنيه مصري*\n\n` +
                            `يرجى تأكيد الاستلام لتزويدكم بتفاصيل التوصيل 🚚.`;

            const encoded = encodeURIComponent(message);
            window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}`, '_blank');
        });
    });

    function addToCart(id, name, weight, price) {
        const existingIndex = cartState.findIndex(item => item.id === id && item.weight === weight);

        if (existingIndex > -1) {
            cartState[existingIndex].qty += 1;
        } else {
            cartState.push({
                id,
                name,
                weight,
                price,
                qty: 1
            });
        }
        updateCartUI();
    }

    function updateCartUI() {
        // تحديث العداد
        const totalCount = cartState.reduce((sum, item) => sum + item.qty, 0);
        cartCountBadge.textContent = totalCount;

        // تحديث محتوى السلة
        if (cartState.length === 0) {
            cartEmptyMsg.style.display = 'block';
            cartBody.querySelectorAll('.cart-item').forEach(el => el.remove());
            cartTotalVal.textContent = '0 جنيه';
            return;
        }

        cartEmptyMsg.style.display = 'none';
        cartBody.querySelectorAll('.cart-item').forEach(el => el.remove());

        let totalPrice = 0;

        cartState.forEach((item, index) => {
            const itemTotal = item.price * item.qty;
            totalPrice += itemTotal;

            const itemEl = document.createElement('div');
            itemEl.className = 'cart-item';
            itemEl.innerHTML = `
                <div class="cart-item-info">
                    <div class="cart-item-title">${item.name}</div>
                    <div class="cart-item-weight">الوزن: ${item.weight}</div>
                    <div class="cart-item-price">${itemTotal} جنيه</div>
                </div>
                <div class="cart-qty-controls">
                    <button class="qty-btn" data-action="minus" data-index="${index}">-</button>
                    <span style="font-weight: 700; color: #fff;">${item.qty}</span>
                    <button class="qty-btn" data-action="plus" data-index="${index}">+</button>
                </div>
            `;
            cartBody.appendChild(itemEl);
        });

        cartTotalVal.textContent = `${totalPrice} جنيه`;

        // ربط أزرار زيادة ونقصان الكمية
        cartBody.querySelectorAll('.qty-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(btn.getAttribute('data-index'), 10);
                const action = btn.getAttribute('data-action');

                if (action === 'plus') {
                    cartState[idx].qty += 1;
                } else if (action === 'minus') {
                    cartState[idx].qty -= 1;
                    if (cartState[idx].qty <= 0) {
                        cartState.splice(idx, 1);
                    }
                }
                updateCartUI();
            });
        });
    }

    // تأكيد الطلب الكامل عبر الواتساب من السلة
    checkoutWhatsappBtn.addEventListener('click', () => {
        if (cartState.length === 0) {
            alert('سلة التسوق فارغة حالياً!');
            return;
        }

        let orderSummary = `مرحباً مناحل دهب 🍯، أود تأكيد الطلبية التالية من متجركم:\n\n`;
        let totalPrice = 0;

        cartState.forEach((item, i) => {
            const subtotal = item.price * item.qty;
            totalPrice += subtotal;
            orderSummary += `${i + 1}. *${item.name}* (${item.weight}) × ${item.qty} = ${subtotal} جنيه\n`;
        });

        orderSummary += `\n💰 *إجمالي المطلوب:* *${totalPrice} جنيه مصري*\n\n` +
                         `يرجى تأكيد التوفر وإرسال تفاصيل الشحن والتوصيل 🚚.`;

        const encoded = encodeURIComponent(orderSummary);
        window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}`, '_blank');
    });

    /* --------------------------------------------------------------------------
       5. الأسئلة الشائعة الأكورديون (FAQ Accordion)
       -------------------------------------------------------------------------- */
    const faqItems = document.querySelectorAll('.faq-item');

    faqItems.forEach(item => {
        const questionBtn = item.querySelector('.faq-question');
        questionBtn.addEventListener('click', () => {
            const isActive = item.classList.contains('active');

            faqItems.forEach(i => i.classList.remove('active'));

            if (!isActive) {
                item.classList.add('active');
            }
        });
    });
});
