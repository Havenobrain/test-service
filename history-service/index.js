const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');

const app = express();
const PORT = 4000;

// Подключение к базе данных PostgreSQL
const pool = new Pool({
    user: 'georgijsergeev',        // Имя пользователя PostgreSQL
    host: 'localhost',             // Хост (локальная машина)
    database: 'georgijsergeev',    // Имя базы данных
    password: '',                  // Пароль (если не задан, оставить пустым)
    port: 5432,                    // Порт PostgreSQL
});

// Middleware для обработки JSON
app.use(bodyParser.json());

// Базовый маршрут
app.get('/', (req, res) => {
    res.send('History Service is running!');
});

// POST /logs - Добавить запись в лог
app.post('/logs', async (req, res) => {
    const { shop_id, plu, action } = req.body;

    if (!shop_id || !plu || !action) {
        return res.status(400).json({ error: 'shop_id, plu и action обязательны' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO action_logs (shop_id, plu, action) VALUES ($1, $2, $3) RETURNING *',
            [shop_id, plu, action]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка при добавлении записи в лог' });
    }
});

// GET /logs - Получить логи с фильтрацией
app.get('/logs', async (req, res) => {
    const { shop_id, plu, start_date, end_date, action, limit = 10, offset = 0 } = req.query;

    try {
        let query = 'SELECT * FROM action_logs WHERE 1=1';
        const params = [];

        if (shop_id) {
            params.push(shop_id);
            query += ` AND shop_id = $${params.length}`;
        }

        if (plu) {
            params.push(plu);
            query += ` AND plu = $${params.length}`;
        }

        if (start_date) {
            params.push(start_date);
            query += ` AND timestamp >= $${params.length}`;
        }

        if (end_date) {
            params.push(end_date);
            query += ` AND timestamp <= $${params.length}`;
        }

        if (action) {
            params.push(action);
            query += ` AND action = $${params.length}`;
        }

        query += ` ORDER BY timestamp DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка при получении логов' });
    }
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`History Service is running on http://localhost:${PORT}`);
});
