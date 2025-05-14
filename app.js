const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const path=require('path');

const app = express();
app.use(bodyParser.json());

// Connect to MySQL
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Kavin@2005',
    database: 'store_management'
});

db.connect(err => {
    if (err) {
        console.error('Database connection failed:', err.stack);
        return;
    }
    console.log('Connected to MySQL');
});
app.get('/', (req, res) => {
    res.send('Welcome to the Store Management System API!');
});
app.get('/product', (req, res) => {
      res.sendFile(path.join(__dirname,'public','product.html'));
});
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname,'public','admin.html'));
});


// API endpoint: fetch all products
app.get('/products', (req, res) => {
    const query = 'SELECT * FROM Product';

    db.query(query, (err, results) => {
        if (err) {
            console.error(err);
            return res.json({ success: false, message: 'Error fetching products.' });
        }
        res.json({ success: true, products: results });
    });
});

// Route to get category summary
app.get('/category-summary', (req, res) => {
    const query = `
        SELECT c.name AS category_name, COUNT(p.product_id) AS item_count
        FROM Category c
        LEFT JOIN Product p ON c.category_id = p.category_id
        GROUP BY c.category_id
    `;
    const filtered = 'allProducts.filter(p => p.category_id === category.id)';


    db.query(query, (err, results) => {
        if (err) {
            console.error(err);
            return res.json({ success: false, message: 'Error fetching category summary.' });
        }
        res.json({ success: true, summary: results });
    });
});


// Serve shopping page
app.get('/shopping', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'shopping.html'));
});


// Route to handle supplier product requests
app.post('/supplier/add-product', (req, res) => {
    const { supplier_id, name, brand, category_id, price_per_unit, stock_quantity } = req.body;

    // Insert into Product_Request table (no need to manually insert product_id; let MySQL auto-increment)
    const query = `
        INSERT INTO Product_Request (supplier_id, product_name, brand, category_id, price_per_unit, stock_quantity, status)
        VALUES (?, ?, ?, ?, ?, ?, 'Pending')
    `;

    db.query(query, [supplier_id, name, brand, category_id, price_per_unit, stock_quantity], (err, result) => {
        if (err) {
            console.error(err);
            return res.json({ success: false, message: 'Database error.' });
        }
        res.json({ success: true, message: 'Product request submitted.' });
    });
});

// Admin route to fetch pending product requests
app.get('/admin/pending-requests', (req, res) => {
    const query = 'SELECT * FROM Product_Request WHERE status = "Pending"';
    
    db.query(query, (err, results) => {
        if (err) {
            console.error(err);
            return res.json({ success: false, message: 'Database error.' });
        }
        res.json({ success: true, requests: results });
    });
});

// Admin route to approve a product request
app.post('/admin/approve/:requestId', (req, res) => {
    const { requestId } = req.params;

    // Step 1: Fetch the request details
    const getRequestQuery = 'SELECT * FROM Product_Request WHERE request_id = ?';
    db.query(getRequestQuery, [requestId], (err, results) => {
        if (err) {
            console.error('Error fetching request:', err);
            return res.json({ success: false, message: 'Database error fetching request.' });
        }

        if (results.length === 0) {
            return res.json({ success: false, message: 'Request not found.' });
        }

        const request = results[0];
        const { supplier_id, product_name, brand, category_id, price_per_unit, stock_quantity } = request;

        // Step 2: Insert approved product into the Product table
        const insertProductQuery = `
            INSERT INTO Product (supplier_id, name, brand, category_id, price_per_unit, stock_quantity)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        db.query(insertProductQuery, [supplier_id, product_name, brand, category_id, price_per_unit, stock_quantity], (err, insertResult) => {
            if (err) {
                console.error('Error inserting product:', err);
                return res.json({ success: false, message: 'Error adding product to store.' });
            }

            // Step 3: Update the request status to 'Approved'
            const updateRequestQuery = 'UPDATE Product_Request SET status = "Approved" WHERE request_id = ?';
            db.query(updateRequestQuery, [requestId], (err, updateResult) => {
                if (err) {
                    console.error('Error updating request status:', err);
                    return res.json({ success: false, message: 'Error updating request status.' });
                }
                res.json({ success: true, message: 'Product request approved and added to Product table.' });
            });
        });
    });
});



// Admin route to reject a product request
app.post('/admin/reject/:requestId', (req, res) => {
    const { requestId } = req.params;

    const query = 'UPDATE Product_Request SET status = "Rejected" WHERE request_id = ?';
    
    db.query(query, [requestId], (err, result) => {
        if (err) {
            console.error(err);
            return res.json({ success: false, message: 'Error rejecting request.' });
        }
        res.json({ success: true, message: 'Product request rejected.' });
    });
});

// Server listening on port 3000
app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
