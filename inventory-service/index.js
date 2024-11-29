const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const axios = require('axios'); 

const app = express();
const PORT = 3000;


const pool = new Pool({
    user: 'georgijsergeev',        
    host: 'localhost',             
    database: 'georgijsergeev',    
    password: '',                  
    port: 5432,                    
});


app.use(bodyParser.json());


app.get('/', (req, res) => {
    res.send('Inventory Service is running!');
});


app.post('/products', async (req, res) => {
    const { plu, name } = req.body;

    if (!plu || !name) {
        return res.status(400).json({ error: 'PLU и имя обязательны' });
    }

    try {
        
        const existingProduct = await pool.query('SELECT * FROM products WHERE plu = $1', [plu]);
        if (existingProduct.rows.length > 0) {
            return res.status(400).json({ error: 'PLU уже существует' });
        }

       
        const result = await pool.query(
            'INSERT INTO products (plu, name) VALUES ($1, $2) RETURNING *',
            [plu, name]
        );

        
        await axios.post('http://localhost:4000/logs', {
            shop_id: 'default_shop', 
            plu: plu,
            action: 'create_product'
        });

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Ошибка при создании товара:', err.message);
        res.status(500).json({ error: 'Ошибка при создании товара' });
    }
});


app.get('/products', async (req, res) => {
    const { name, plu } = req.query;

    try {
        let query = 'SELECT * FROM products WHERE 1=1';
        const params = [];

        if (name) {
            params.push(`%${name}%`);
            query += ` AND name ILIKE $${params.length}`;
        }

        if (plu) {
            params.push(plu);
            query += ` AND plu = $${params.length}`;
        }

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка при получении товаров:', err.message);
        res.status(500).json({ error: 'Ошибка при получении товаров' });
    }
});


app.post('/stock', async (req, res) => {
    const { product_id, shop_id, quantity_on_shelf, quantity_in_order } = req.body;

    if (!product_id || !shop_id || quantity_on_shelf === undefined || quantity_in_order === undefined) {
        return res.status(400).json({ error: 'Все поля обязательны' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO stock (product_id, shop_id, quantity_on_shelf, quantity_in_order) VALUES ($1, $2, $3, $4) RETURNING *',
            [product_id, shop_id, quantity_on_shelf, quantity_in_order]
        );

       
        await axios.post('http://localhost:4000/logs', {
            shop_id: shop_id,
            plu: result.rows[0].product_id,
            action: 'create_stock'
        });

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Ошибка при создании остатка:', err.message);
        res.status(500).json({ error: 'Ошибка при создании остатка' });
    }
});


app.patch('/stock/increase', async (req, res) => {
    const { id, quantity } = req.body;

    if (!id || !quantity) {
        return res.status(400).json({ error: 'ID и количество обязательны' });
    }

    try {
        const result = await pool.query(
            'UPDATE stock SET quantity_on_shelf = quantity_on_shelf + $1 WHERE id = $2 RETURNING *',
            [quantity, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Остаток не найден' });
        }

        
        await axios.post('http://localhost:4000/logs', {
            shop_id: result.rows[0].shop_id,
            plu: result.rows[0].product_id,
            action: 'increase_stock'
        });

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Ошибка при увеличении остатка:', err.message);
        res.status(500).json({ error: 'Ошибка при увеличении остатка' });
    }
});


app.patch('/stock/decrease', async (req, res) => {
    const { id, quantity } = req.body;

    if (!id || !quantity) {
        return res.status(400).json({ error: 'ID и количество обязательны' });
    }

    try {
        const stock = await pool.query('SELECT * FROM stock WHERE id = $1', [id]);

        if (stock.rows.length === 0) {
            return res.status(404).json({ error: 'Остаток не найден' });
        }

        if (stock.rows[0].quantity_on_shelf < quantity) {
            return res.status(400).json({ error: 'Недостаточно остатков на полке' });
        }

        const result = await pool.query(
            'UPDATE stock SET quantity_on_shelf = quantity_on_shelf - $1 WHERE id = $2 RETURNING *',
            [quantity, id]
        );

        
        await axios.post('http://localhost:4000/logs', {
            shop_id: result.rows[0].shop_id,
            plu: result.rows[0].product_id,
            action: 'decrease_stock'
        });

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Ошибка при уменьшении остатка:', err.message);
        res.status(500).json({ error: 'Ошибка при уменьшении остатка' });
    }
});


app.get('/stock', async (req, res) => {
    const { plu, shop_id, min_quantity, max_quantity, min_order_quantity, max_order_quantity } = req.query;

    try {
        let query = `
            SELECT stock.*, products.plu
            FROM stock
            JOIN products ON stock.product_id = products.id
            WHERE 1=1
        `;
        const params = [];

        if (plu) {
            params.push(plu);
            query += ` AND products.plu = $${params.length}`;
        }
        if (shop_id) {
            params.push(shop_id);
            query += ` AND stock.shop_id = $${params.length}`;
        }
        if (min_quantity) {
            params.push(parseInt(min_quantity));
            query += ` AND stock.quantity_on_shelf >= $${params.length}`;
        }
        if (max_quantity) {
            params.push(parseInt(max_quantity));
            query += ` AND stock.quantity_on_shelf <= $${params.length}`;
        }
        if (min_order_quantity) {
            params.push(parseInt(min_order_quantity));
            query += ` AND stock.quantity_in_order >= $${params.length}`;
        }
        if (max_order_quantity) {
            params.push(parseInt(max_order_quantity));
            query += ` AND stock.quantity_in_order <= $${params.length}`;
        }

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка при фильтрации остатков:', err.message);
        res.status(500).json({ error: 'Ошибка при фильтрации остатков' });
    }
});


app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
