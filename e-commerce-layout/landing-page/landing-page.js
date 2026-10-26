/**
 * مناحل دهب - نظام سلة المشتريات التفاعلي باستخدام React و JavaScript
 * Mnahil Dahab E-Commerce Cart Application
 */

(function () {
    'use strict';

    const CART_STORAGE_KEY = 'mnahil_cart_items';
    const STORE_PHONE = '201093579694'; // Phone number for WhatsApp orders

    // =========================================================================
    // Helpers
    // =========================================================================
    function getStoredCart() {
        try {
            const raw = localStorage.getItem(CART_STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.error('Failed to load cart from localStorage:', e);
            return [];
        }
    }

    function saveStoredCart(items) {
        try {
            localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
        } catch (e) {
            console.error('Failed to save cart to localStorage:', e);
        }
    }

    function formatCurrency(amount) {
        return amount.toLocaleString('ar-EG') + ' ج.م';
    }

    /**
     * Extracts product information from a card DOM element.
     * Uses data-attributes if available, with robust fallback to DOM text.
     */
    function extractProductFromCard(card) {
        if (!card) return null;

        const dataset = card.dataset || {};
        let id = dataset.id;
        let name = dataset.name;
        let price = dataset.price ? parseFloat(dataset.price) : null;
        let image = dataset.image;

        // Fallback for image
        if (!image) {
            const imgEl = card.querySelector('img');
            image = imgEl ? (imgEl.getAttribute('src') || '../empty.jpg') : '../empty.jpg';
        }

        // Fallback for name & price from h3 elements
        if (!name || !price) {
            const headings = Array.from(card.querySelectorAll('h3'));
            headings.forEach(h => {
                const text = h.textContent.trim();
                // Check if this heading represents price
                if (/price|سعر|ج|\$|\d+/i.test(text) && (text.includes('ج') || text.includes('price') || text.includes('$') || text.includes('سعر'))) {
                    const digits = text.replace(/[^0-9.]/g, '');
                    if (digits && !price) {
                        price = parseFloat(digits);
                    }
                } else if (!name) {
                    name = text;
                }
            });
        }

        if (!name) name = 'منتج عسل طبيعي';
        if (!price || isNaN(price)) price = 300;
        if (!id) {
            id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\u0600-\u06FF-]/g, '') || 'item-' + Date.now();
        }

        return { id, name, price, image };
    }

    // =========================================================================
    // React Cart Component
    // =========================================================================
    function initReactCart() {
        if (!window.React || !window.ReactDOM) {
            console.warn('React or ReactDOM is not loaded yet. Waiting...');
            return false;
        }

        const { useState, useEffect, useCallback, useMemo } = React;
        const e = React.createElement;

        function CartApp() {
            const [items, setItems] = useState(getStoredCart);
            const [isOpen, setIsOpen] = useState(false);
            const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
            const [toast, setToast] = useState(null);

            // Customer checkout form state
            const [customerName, setCustomerName] = useState('');
            const [customerPhone, setCustomerPhone] = useState('');
            const [customerAddress, setCustomerAddress] = useState('');
            const [customerNotes, setCustomerNotes] = useState('');

            // Persist to localStorage whenever items change
            useEffect(() => {
                saveStoredCart(items);

                // Update navbar cart number
                const totalQty = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
                const cartNumberEl = document.querySelector('.cart-number');
                if (cartNumberEl) {
                    cartNumberEl.textContent = totalQty;
                    cartNumberEl.classList.remove('bounce');
                    void cartNumberEl.offsetWidth; // trigger reflow
                    cartNumberEl.classList.add('bounce');
                }
            }, [items]);

            // Auto dismiss toast after 3 seconds
            useEffect(() => {
                if (!toast) return;
                const timer = setTimeout(() => {
                    setToast(null);
                }, 3000);
                return () => clearTimeout(timer);
            }, [toast]);

            // Close on ESC key
            useEffect(() => {
                function handleKeyDown(evt) {
                    if (evt.key === 'Escape') {
                        if (isCheckoutOpen) setIsCheckoutOpen(false);
                        else if (isOpen) setIsOpen(false);
                    }
                }
                window.addEventListener('keydown', handleKeyDown);
                return () => window.removeEventListener('keydown', handleKeyDown);
            }, [isOpen, isCheckoutOpen]);

            // Add item to cart
            const addItem = useCallback((product, qty = 1, openImmediately = false) => {
                if (!product || !product.id) return;

                setItems(prev => {
                    const existingIndex = prev.findIndex(item => item.id === product.id);
                    if (existingIndex > -1) {
                        const next = [...prev];
                        next[existingIndex] = {
                            ...next[existingIndex],
                            quantity: next[existingIndex].quantity + qty
                        };
                        return next;
                    } else {
                        return [...prev, { ...product, quantity: qty }];
                    }
                });

                if (openImmediately) {
                    setIsOpen(true);
                } else {
                    setToast({
                        name: product.name,
                        image: product.image,
                        message: 'تمت إضافة ' + product.name + ' إلى السلة 🍯'
                    });
                }
            }, []);

            // Remove item
            const removeItem = useCallback((id) => {
                setItems(prev => prev.filter(item => item.id !== id));
            }, []);

            // Update item quantity
            const updateQty = useCallback((id, delta) => {
                setItems(prev => {
                    return prev.map(item => {
                        if (item.id === id) {
                            const newQty = item.quantity + delta;
                            return newQty > 0 ? { ...item, quantity: newQty } : null;
                        }
                        return item;
                    }).filter(Boolean);
                });
            }, []);

            // Clear entire cart
            const clearCart = useCallback(() => {
                if (items.length === 0) return;
                if (window.confirm('هل أنت متأكد من رغبتك في تفريغ سلة المشتريات؟')) {
                    setItems([]);
                }
            }, [items]);

            // Calculations
            const totalCount = useMemo(() => {
                return items.reduce((sum, item) => sum + item.quantity, 0);
            }, [items]);

            const totalPrice = useMemo(() => {
                return items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            }, [items]);

            // WhatsApp Order URL Generator
            const createWhatsAppUrl = useCallback((customerData = null) => {
                if (items.length === 0) return '#';

                let text = '*طلب شراء جديد من مناحل دهب 🐝*\n\n';
                text += '*المنتجات المطلوبة:*\n';
                items.forEach((item, idx) => {
                    const sub = item.price * item.quantity;
                    text += `${idx + 1}. ${item.name} × ${item.quantity} = ${sub} ج.م\n`;
                });

                text += `\n*الإجمالي الكلي:* ${totalPrice} ج.م\n`;

                if (customerData && customerData.name) {
                    text += '\n*بيانات العميل والتوصيل:*\n';
                    text += `👤 الاسم: ${customerData.name}\n`;
                    if (customerData.phone) text += `📞 الهاتف: ${customerData.phone}\n`;
                    if (customerData.address) text += `📍 العنوان: ${customerData.address}\n`;
                    if (customerData.notes) text += `📝 ملاحظات: ${customerData.notes}\n`;
                }

                text += '\nشكراً لكم!';
                return `https://wa.me/${STORE_PHONE}?text=${encodeURIComponent(text)}`;
            }, [items, totalPrice]);

            // Expose Cart API globally for external buttons
            useEffect(() => {
                window.CartAPI = {
                    addItem: (product, qty, open) => addItem(product, qty, open),
                    openCart: () => setIsOpen(true),
                    closeCart: () => setIsOpen(false),
                    clearCart: () => setItems([]),
                    getItems: () => items,
                    getCount: () => totalCount,
                    getTotal: () => totalPrice
                };
            }, [addItem, items, totalCount, totalPrice]);

            // Submit detailed checkout form
            function handleCheckoutSubmit(e_evt) {
                e_evt.preventDefault();
                if (!customerName.trim()) {
                    alert('يرجى كتابة الاسم بالكامل');
                    return;
                }
                if (!customerAddress.trim()) {
                    alert('يرجى كتابة عنوان التوصيل');
                    return;
                }

                const url = createWhatsAppUrl({
                    name: customerName,
                    phone: customerPhone,
                    address: customerAddress,
                    notes: customerNotes
                });

                window.open(url, '_blank', 'noopener,noreferrer');
                setIsCheckoutOpen(false);
                setIsOpen(false);
            }

            return e('div', { className: 'react-cart-wrapper' },
                // Background Overlay
                e('div', {
                    className: 'cart-overlay' + (isOpen ? ' open' : ''),
                    onClick: () => setIsOpen(false)
                }),

                // Sliding Drawer
                e('div', {
                    className: 'cart-drawer' + (isOpen ? ' open' : ''),
                    role: 'dialog',
                    'aria-label': 'سلة المشتريات'
                },
                    // Drawer Header
                    e('div', { className: 'cart-drawer-header' },
                        e('div', { className: 'cart-drawer-title-group' },
                            e('span', { style: { fontSize: '1.4rem' } }, '🐝'),
                            e('h2', null, 'سلة المشتريات'),
                            e('span', { className: 'cart-count-badge' }, `${totalCount} ${totalCount === 1 ? 'منتج' : 'منتجات'}`)
                        ),
                        e('button', {
                            className: 'cart-close-btn',
                            onClick: () => setIsOpen(false),
                            'aria-label': 'إغلاق السلة'
                        }, '×')
                    ),

                    // Drawer Body
                    e('div', { className: 'cart-drawer-body' },
                        items.length === 0
                            ? e('div', { className: 'cart-empty-state' },
                                e('div', { className: 'cart-empty-icon' }, '🛒'),
                                e('div', { className: 'cart-empty-text' }, 'سلة المشتريات فارغة'),
                                e('div', { className: 'cart-empty-subtext' }, 'تفضل باختيار أجود أنواع العسل الطبيعي ومنتجات الخلية.'),
                                e('button', {
                                    className: 'cart-empty-btn',
                                    onClick: () => {
                                        setIsOpen(false);
                                        const productsEl = document.getElementById('products');
                                        if (productsEl) productsEl.scrollIntoView({ behavior: 'smooth' });
                                    }
                                }, 'تصفح المنتجات الآن')
                            )
                            : items.map(item =>
                                e('div', { key: item.id, className: 'cart-item-card' },
                                    e('img', {
                                        className: 'cart-item-image',
                                        src: item.image,
                                        alt: item.name,
                                        onError: (evt) => { evt.target.src = '../empty.jpg'; }
                                    }),
                                    e('div', { className: 'cart-item-details' },
                                        e('h4', { className: 'cart-item-name' }, item.name),
                                        e('span', { className: 'cart-item-unit-price' }, formatCurrency(item.price)),
                                        e('div', { className: 'cart-item-qty-row' },
                                            e('button', {
                                                className: 'cart-qty-btn',
                                                title: 'تقليل الكمية',
                                                onClick: () => updateQty(item.id, -1)
                                            }, '–'),
                                            e('span', { className: 'cart-qty-display' }, item.quantity),
                                            e('button', {
                                                className: 'cart-qty-btn',
                                                title: 'زيادة الكمية',
                                                onClick: () => updateQty(item.id, 1)
                                            }, '+'),
                                            e('span', { className: 'cart-item-subtotal' }, formatCurrency(item.price * item.quantity))
                                        )
                                    ),
                                    e('button', {
                                        className: 'cart-item-remove-btn',
                                        title: 'حذف المنتج',
                                        onClick: () => removeItem(item.id)
                                    }, '🗑')
                                )
                            )
                    ),

                    // Drawer Footer
                    items.length > 0 && e('div', { className: 'cart-drawer-footer' },
                        e('div', { className: 'cart-summary-line' },
                            e('span', null, 'عدد القطع:'),
                            e('span', { style: { fontWeight: 'bold' } }, totalCount)
                        ),
                        e('div', { className: 'cart-summary-line total' },
                            e('span', null, 'الإجمالي:'),
                            e('span', { className: 'cart-total-price' }, formatCurrency(totalPrice))
                        ),
                        e('div', { className: 'cart-checkout-actions' },
                            // Quick WhatsApp Order
                            e('a', {
                                className: 'cart-btn-whatsapp',
                                href: createWhatsAppUrl(),
                                target: '_blank',
                                rel: 'noopener noreferrer'
                            }, 'طلب فوري عبر واتساب 💬'),

                            // Open Detailed Delivery Info Modal
                            e('button', {
                                className: 'cart-btn-primary',
                                onClick: () => setIsCheckoutOpen(true)
                            }, 'إدخال بيانات التوصيل 📝'),

                            // Clear cart button
                            e('button', {
                                className: 'cart-btn-clear',
                                onClick: clearCart
                            }, 'تفريغ السلة')
                        )
                    )
                ),

                // Toast Notification
                toast && e('div', { className: 'cart-toast-container' },
                    e('div', { className: 'cart-toast' },
                        e('img', {
                            className: 'cart-toast-img',
                            src: toast.image,
                            alt: '',
                            onError: (evt) => { evt.target.src = '../empty.jpg'; }
                        }),
                        e('span', { className: 'cart-toast-msg' }, toast.message),
                        e('button', {
                            className: 'cart-toast-btn',
                            onClick: () => {
                                setToast(null);
                                setIsOpen(true);
                            }
                        }, 'عرض السلة')
                    )
                ),

                // Detailed Checkout Modal
                e('div', {
                    className: 'checkout-modal-overlay' + (isCheckoutOpen ? ' open' : ''),
                    onClick: (evt) => {
                        if (evt.target === evt.currentTarget) setIsCheckoutOpen(false);
                    }
                },
                    e('div', { className: 'checkout-modal' },
                        e('div', { className: 'checkout-modal-header' },
                            e('h3', null, 'إتمام طلب الشراء 🐝'),
                            e('button', {
                                className: 'cart-close-btn',
                                onClick: () => setIsCheckoutOpen(false)
                            }, '×')
                        ),
                        e('form', { onSubmit: handleCheckoutSubmit },
                            e('div', { className: 'checkout-modal-body' },
                                e('div', { className: 'checkout-form-group' },
                                    e('label', null, 'الاسم بالكامل *'),
                                    e('input', {
                                        type: 'text',
                                        required: true,
                                        placeholder: 'مثال: محمد أحمد',
                                        value: customerName,
                                        onChange: (evt) => setCustomerName(evt.target.value)
                                    })
                                ),
                                e('div', { className: 'checkout-form-group' },
                                    e('label', null, 'رقم الهاتف / واتساب *'),
                                    e('input', {
                                        type: 'tel',
                                        required: true,
                                        placeholder: '010XXXXXXXX',
                                        value: customerPhone,
                                        onChange: (evt) => setCustomerPhone(evt.target.value)
                                    })
                                ),
                                e('div', { className: 'checkout-form-group' },
                                    e('label', null, 'عنوان التوصيل بالتفصيل *'),
                                    e('textarea', {
                                        required: true,
                                        rows: 2,
                                        placeholder: 'المدينة، المنطقة، اسم الشارع، رقم العمارة أو الشقة',
                                        value: customerAddress,
                                        onChange: (evt) => setCustomerAddress(evt.target.value)
                                    })
                                ),
                                e('div', { className: 'checkout-form-group' },
                                    e('label', null, 'ملاحظات إضافية (اختياري)'),
                                    e('textarea', {
                                        rows: 2,
                                        placeholder: 'أي تعليمات خاصة بالطلب أو ميعاد الاستلام',
                                        value: customerNotes,
                                        onChange: (evt) => setCustomerNotes(evt.target.value)
                                    })
                                ),
                                e('div', { className: 'checkout-order-summary' },
                                    e('span', null, `عدد المنتجات: ${totalCount}`),
                                    e('span', { className: 'cart-total-price' }, formatCurrency(totalPrice))
                                )
                            ),
                            e('div', { className: 'checkout-modal-footer' },
                                e('button', {
                                    type: 'submit',
                                    className: 'cart-btn-whatsapp'
                                }, 'إرسال الطلب عبر واتساب 💬'),
                                e('button', {
                                    type: 'button',
                                    className: 'cart-btn-secondary',
                                    onClick: () => setIsCheckoutOpen(false)
                                }, 'رجوع للسلة')
                            )
                        )
                    )
                )
            );
        }

        // Mount React application
        const rootElement = document.getElementById('cart-root');
        if (rootElement) {
            const root = ReactDOM.createRoot(rootElement);
            root.render(e(CartApp));
            return true;
        } else {
            console.error('#cart-root element not found!');
            return false;
        }
    }

    // =========================================================================
    // DOM Click Listeners for Product Cards and Cart Buttons
    // =========================================================================
    function setupDOMListeners() {
        // 1. Listen for clicks on "Add to cart" and "Buy now" buttons
        document.addEventListener('click', function (evt) {
            const btn = evt.target.closest('.shop-card-button');
            if (!btn) return;

            evt.preventDefault();
            const card = btn.closest('.card');
            if (!card) return;

            const product = extractProductFromCard(card);
            const btnText = btn.textContent.toLowerCase();
            const isBuyNow = btnText.includes('buy') || btnText.includes('شراء') || btnText.includes('الآن');

            if (window.CartAPI) {
                window.CartAPI.addItem(product, 1, isBuyNow);
            } else {
                console.warn('CartAPI not initialized yet. Queueing action...');
            }
        });

        // 2. Open cart drawer when clicking on .cart-container or #cart-button in navbar
        const cartTrigger = document.querySelector('.cart-container');
        if (cartTrigger) {
            cartTrigger.addEventListener('click', function (evt) {
                evt.preventDefault();
                if (window.CartAPI) {
                    window.CartAPI.openCart();
                }
            });

            // Enter / Space key accessibility for cart icon
            cartTrigger.addEventListener('keydown', function (evt) {
                if (evt.key === 'Enter' || evt.key === ' ') {
                    evt.preventDefault();
                    if (window.CartAPI) {
                        window.CartAPI.openCart();
                    }
                }
            });
        }
    }

    // =========================================================================
    // Initialization Bootstrap
    // =========================================================================
    function start() {
        // Try mounting React
        let attempts = 0;
        function tryMount() {
            if (initReactCart()) {
                setupDOMListeners();
            } else if (attempts < 20) {
                attempts++;
                setTimeout(tryMount, 100);
            } else {
                console.error('Could not initialize React Cart after 20 attempts.');
                setupDOMListeners();
            }
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', tryMount);
        } else {
            tryMount();
        }
    }

    start();
})();
