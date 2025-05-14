const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Database connection pool
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'Kavin@2005',
    database: 'store_management',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test database connection
pool.getConnection((err, connection) => {
    if (err) {
        console.error('Database connection failed:', err.stack);
        return;
    }
    console.log('Connected to database.');
    connection.release();
});

// API Endpoints
app.use(express.json());
// 1. Get all categories
app.get('/api/categories', (req, res) => {
    const query = 'SELECT category_id, category_name FROM Categories ORDER BY category_name';
    
    pool.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching categories:', err);
            return res.status(500).json({ 
                success: false,
                error: 'Failed to fetch categories' 
            });
        }
        
        console.log('Categories fetched:', results);
        res.json({
            success: true,
            categories: results
        });
    });
});

// 2. Get all suppliers
app.get('/api/suppliers', (req, res) => {
    const query = 'SELECT supplier_id, supplier_name FROM Suppliers ORDER BY supplier_name';
    
    pool.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching suppliers:', err);
            return res.status(500).json({ 
                success: false,
                error: 'Failed to fetch suppliers' 
            });
        }
        
        
        res.json({
            success: true,
            suppliers: results
        });
    });
});

// 3. Submit new product request
app.post('/api/product-requests', (req, res) => {
    const {
        product_name,
        description,
        category_id,
        supplier_id,
        suggested_price,
        quantity
    } = req.body;

    if (!product_name || !category_id || !supplier_id || !quantity) {
        return res.status(400).json({ 
            success: false,
            error: 'Product name, category, supplier and quantity are required' 
        });
    }

    const
     query = `
        INSERT INTO Product_Requests (
            product_name, description, category_id, supplier_id, 
            suggested_price, quantity, status
        ) VALUES (?, ?, ?, ?, ?, ?, 'Pending')
    `;
    
    const values = [
        product_name, 
        description, 
        category_id, 
        supplier_id, 
        suggested_price || null, 
        quantity
    ];

    pool.query(query, values, (err, result) => {
        if (err) {
            console.error('Error inserting product request:', err);
            return res.status(500).json({ 
                success: false,
                error: 'Failed to submit request. Please try again.' 
            });
        }

        res.status(201).json({
            success: true,
            message: 'Product request submitted successfully!',
            requestId: result.insertId
        });
    });
});

// 4. Add new supplier
app.post('/api/suppliers', (req, res) => {
    const { supplier_name, email, phone, city } = req.body;
    
    if (!supplier_name || !phone) {
        return res.status(400).json({ 
            success: false,
            error: 'Supplier name and phone are required' 
        });
    }

    const query = 'INSERT INTO Suppliers (supplier_name, email, phone, city) VALUES (?, ?, ?, ?)';
    
    pool.query(query, [supplier_name, email, phone, city], (err, result) => {
        if (err) {
            console.error('Error adding supplier:', err);
            return res.status(500).json({ 
                success: false,
                error: 'Failed to add supplier' 
            });
        }
        
        res.status(201).json({
            success: true,
            message: 'Supplier added successfully',
            supplierId: result.insertId
        });
    });
});

// 5. Add new category
app.post('/api/categories', (req, res) => {
    const { category_name, description } = req.body;
    
    if (!category_name) {
        return res.status(400).json({ 
            success: false,
            error: 'Category name is required' 
        });
    }
    
    const query = 'INSERT INTO Categories (category_name, description) VALUES (?, ?)';
    
    pool.query(query, [category_name, description], (err, result) => {
        if (err) {
            console.error('Error adding category:', err);
            return res.status(500).json({ 
                success: false,
                error: 'Failed to add category' 
            });
        }
        
        res.status(201).json({ 
            success: true,
            message: 'Category added successfully',
            categoryId: result.insertId 
        });
    });
});

// ✅ API to get pending requests
app.get('/api/product-requests/pending', async (req, res) => {
    try {
        const [rows] = await pool.promise().query(`
            SELECT pr.*, c.category_name, s.supplier_name
            FROM Product_Requests pr
            JOIN Categories c ON pr.category_id = c.category_id
            JOIN Suppliers s ON pr.supplier_id = s.supplier_id
            WHERE pr.status = 'Pending'
        `);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching pending requests:', err);
        res.status(500).json({ error: 'Failed to fetch pending requests' });
    }
});

// ✅ API to update request status

app.put('/api/product-requests/:requestId/status', async (req, res) => {
    const { requestId } = req.params;
    const { status } = req.body;

    try {
        // First get the request details
        const [request] = await pool.promise().query(
            `SELECT * FROM Product_Requests WHERE request_id = ?`,
            [requestId]
        );

        if (request.length === 0) {
            return res.status(404).json({ error: 'Request not found' });
        }

        const requestData = request[0];

        // Update the status of the product request
        await pool.promise().query(
            `UPDATE Product_Requests SET status = ? WHERE request_id = ?`,
            [status, requestId]
        );

        // If the status is 'Approved', insert the product into the Products table
        if (status === 'Approved') {
            await pool.promise().query(`
                INSERT INTO Products 
                (product_name, description, category_id, supplier_id, unit_price, quantity)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                requestData.product_name,
                requestData.description,
                requestData.category_id,
                requestData.supplier_id,
                requestData.suggested_price || 0,
                requestData.quantity
            ]);
        }

        res.json({ message: `Request ${status} successfully` });
    } catch (err) {
        console.error('Error updating request status:', err);
        res.status(500).json({ error: 'Failed to update request status' });
    }
});


// ✅ API to insert approved product
app.post('/api/products', async (req, res) => {
    const { product_name, description, category_id, supplier_id, unit_price, quantity } = req.body;
    try {
        await pool.promise().query(`
            INSERT INTO Products (product_name, description, category_id, supplier_id, unit_price, quantity)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [product_name, description, category_id, supplier_id, unit_price, quantity]);
        res.json({ message: 'Product added successfully' });
    } catch (err) {
        console.error('Error inserting product:', err);
        res.status(500).json({ error: 'Failed to add product' });
    }
});

// ✅ API to get all products
app.get('/api/products', async (req, res) => {
    try {
        const [rows] = await pool.promise().query(`
            SELECT p.*, c.category_name, s.supplier_name
            FROM Products p
            JOIN Categories c ON p.category_id = c.category_id
            JOIN Suppliers s ON p.supplier_id = s.supplier_id
        `);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching products:', err);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

// Customers API Endpoints

// Get all customers
app.get('/api/customers', (req, res) => {
    const query = 'SELECT * FROM Customers ORDER BY name';
    
    pool.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching customers:', err);
            return res.status(500).json({ 
                success: false,
                error: 'Failed to fetch customers' 
            });
        }
        
        res.json(results);
    });
});

// Add new customer
app.post('/api/customers', (req, res) => {
    const { name, email, phone, address, city, postal_code } = req.body;
    
    if (!name) {
        return res.status(400).json({ 
            success: false,
            error: 'Customer name is required' 
        });
    }

    const query = `
        INSERT INTO Customers 
        (name, email, phone, address, city, postal_code) 
        VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    pool.query(query, 
        [name, email, phone, address, city, postal_code], 
        (err, result) => {
            if (err) {
                console.error('Error adding customer:', err);
                return res.status(500).json({ 
                    success: false,
                    error: 'Failed to add customer' 
                });
            }
            
            res.status(201).json({
                success: true,
                message: 'Customer added successfully',
                customerId: result.insertId
            });
        }
    );
});

// Update customer
app.put('/api/customers/:id', (req, res) => {
    const customerId = req.params.id;
    const { name, email, phone, address, city, postal_code } = req.body;
    
    if (!name) {
        return res.status(400).json({ 
            success: false,
            error: 'Customer name is required' 
        });
    }

    const query = `
        UPDATE Customers SET 
        name = ?, email = ?, phone = ?, address = ?, city = ?, postal_code = ?
        WHERE customer_id = ?
    `;
    
    pool.query(query, 
        [name, email, phone, address, city, postal_code, customerId], 
        (err, result) => {
            if (err) {
                console.error('Error updating customer:', err);
                return res.status(500).json({ 
                    success: false,
                    error: 'Failed to update customer' 
                });
            }
            
            if (result.affectedRows === 0) {
                return res.status(404).json({ 
                    success: false,
                    error: 'Customer not found' 
                });
            }
            
            res.json({
                success: true,
                message: 'Customer updated successfully'
            });
        }
    );
});

// Delete customer
app.delete('/api/customers/:id', (req, res) => {
    const customerId = req.params.id;
    
    const query = 'DELETE FROM Customers WHERE customer_id = ?';
    
    pool.query(query, [customerId], (err, result) => {
        if (err) {
            console.error('Error deleting customer:', err);
            return res.status(500).json({ 
                success: false,
                error: 'Failed to delete customer' 
            });
        }
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'Customer not found' 
            });
        }
        
        res.json({
            success: true,
            message: 'Customer deleted successfully'
        });
    });
});

// API to create order
app.post('/api/orders', (req, res) => {
    const { product_id, quantity, unit_price, customer_id, payment_method, shipping_address } = req.body;

    if (!product_id || !quantity || !unit_price || !customer_id || !payment_method || !shipping_address) {
        return res.json({ success: false, message: 'Missing data.' });
    }

    // Check product stock
    pool.query('SELECT quantity FROM Products WHERE product_id = ?', [product_id], (err, productResult) => {
        if (err) return res.json({ success: false, message: 'Database error.' });
        if (productResult.length === 0) return res.json({ success: false, message: 'Product not found.' });

        const availableStock = productResult[0].quantity;
        if (quantity > availableStock) {
            return res.json({ success: false, message: 'Not enough stock available.' });
        }

        const subtotal = quantity * unit_price;
        const total_amount = subtotal; // for single product order

        // Insert into Orders
        pool.query(`
            INSERT INTO Orders (customer_id, total_amount, payment_method, shipping_address)
            VALUES (?, ?, ?, ?)
        `, [customer_id, total_amount, payment_method, shipping_address], (err2, orderResult) => {
            if (err2) return res.json({ success: false, message: 'Error creating order.' });

            const order_id = orderResult.insertId;

            // Insert into Order_Items
            pool.query(`
                INSERT INTO Order_Items (order_id, product_id, quantity, unit_price)
                VALUES (?, ?, ?, ?)
            `, [order_id, product_id, quantity, unit_price], (err3, orderItemResult) => {
                if (err3) return res.json({ success: false, message: 'Error adding order item.' });

                // Update Products table to reduce stock
                pool.query(`
                    UPDATE Products
                    SET quantity = quantity - ?
                    WHERE product_id = ?
                `, [quantity, product_id], (err4, updateResult) => {
                    if (err4) return res.json({ success: false, message: 'Error updating stock.' });

                    res.json({ success: true, order_id });
                });
            });
        });
    });
});

// ✅ Get all orders with customer info
app.get('/api/orders', (req, res) => {
    const query = `
        SELECT o.order_id, o.customer_id, c.name AS customer_name, o.total_amount, o.payment_method, o.shipping_address, o.order_date
        FROM Orders o
        JOIN Customers c ON o.customer_id = c.customer_id
        ORDER BY o.order_date DESC
    `;
    
    pool.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching orders:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch orders' 
            });
        }
        
        res.json({
            success: true,
            orders: results
        });
    });
});

// ✅ Get order details including products
app.get('/api/orders/:id', (req, res) => {
    const orderId = req.params.id;
    const query = `
        SELECT o.order_id, o.total_amount, o.payment_method, o.shipping_address, o.order_date,
               oi.product_id, p.product_name, oi.quantity, oi.unit_price,
               c.customer_id, c.name AS customer_name
        FROM Orders o
        JOIN Order_Items oi ON o.order_id = oi.order_id
        JOIN Products p ON oi.product_id = p.product_id
        JOIN Customers c ON o.customer_id = c.customer_id
        WHERE o.order_id = ?
    `;

    pool.query(query, [orderId], (err, results) => {
        if (err) {
            console.error('Error fetching order details:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch order details' 
            });
        }
        
        res.json({
            success: true,
            order: results
        });
    });
});

// Helper function to execute queries
async function executeQuery(query, params = []) {
    return new Promise((resolve, reject) => {
        pool.query(query, params, (err, results) => {
            if (err) return reject(err);
            resolve(results);
        });
    });
}

// Get total orders count
app.get('/api/orders/total-count', async (req, res) => {
    try {
        const results = await executeQuery('SELECT COUNT(*) as count FROM Orders');
        res.json({ count: results[0].count });
    } catch (err) {
        console.error('Error fetching total orders count:', err);
        res.status(500).json({ error: 'Failed to fetch total orders count' });
    }
});

// Get total sales amount
app.get('/api/orders/total-sales', async (req, res) => {
    try {
        const results = await executeQuery(
            'SELECT SUM(total_amount) as total_amount FROM Orders WHERE status = "Delivered"'
        );
        res.json({ total_amount: results[0].total_amount || 0 });
    } catch (err) {
        console.error('Error fetching total sales:', err);
        res.status(500).json({ error: 'Failed to fetch total sales' });
    }
});

// Get product statistics by category
app.get('/api/products/category-stats', async (req, res) => {
    try {
        const results = await executeQuery(`
            SELECT 
                c.category_name,
                COUNT(p.product_id) as product_count,
                SUM(p.quantity) as total_stock
            FROM Categories c
            LEFT JOIN Products p ON c.category_id = p.category_id
            GROUP BY c.category_id, c.category_name
            ORDER BY c.category_name
        `);
        res.json(results);
    } catch (err) {
        console.error('Error fetching category stats:', err);
        res.status(500).json({ error: 'Failed to fetch category statistics' });
    }
});

// Get pending product requests
app.get('/api/product-requests/pending', async (req, res) => {
    try {
        const results = await executeQuery(`
            SELECT pr.*, c.category_name, s.supplier_name
            FROM Product_Requests pr
            JOIN Categories c ON pr.category_id = c.category_id
            JOIN Suppliers s ON pr.supplier_id = s.supplier_id
            WHERE pr.status = 'Pending'
        `);
        res.json(results);
    } catch (err) {
        console.error('Error fetching pending requests:', err);
        res.status(500).json({ error: 'Failed to fetch pending requests' });
    }
});

// Update product request status
app.put('/api/product-requests/:requestId/status', async (req, res) => {
    const { requestId } = req.params;
    const { status } = req.body;

    try {
        // First get the request details
        const [request] = await executeQuery(
            `SELECT * FROM Product_Requests WHERE request_id = ?`,
            [requestId]
        );

        if (request.length === 0) {
            return res.status(404).json({ error: 'Request not found' });
        }

        const requestData = request[0];

        // Update the status of the product request
        await executeQuery(
            `UPDATE Product_Requests SET status = ? WHERE request_id = ?`,
            [status, requestId]
        );

        // If the status is 'Approved', insert the product into the Products table
        if (status === 'Approved') {
            await executeQuery(`
                INSERT INTO Products 
                (product_name, description, category_id, supplier_id, unit_price, quantity)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                requestData.product_name,
                requestData.description,
                requestData.category_id,
                requestData.supplier_id,
                requestData.suggested_price || 0,
                requestData.quantity
            ]);
        }

        res.json({ message: `Request ${status} successfully` });
    } catch (err) {
        console.error('Error updating request status:', err);
        res.status(500).json({ error: 'Failed to update request status' });
    }
});

// Get pending order requests
app.get('/api/order-requests/pending', async (req, res) => {
    try {
        const results = await executeQuery(`
            SELECT o.order_id, o.status, o.order_date, o.total_amount,
                   c.name AS customer_name, 
                   p.product_name, 
                   oi.quantity, oi.unit_price
            FROM Orders o
            JOIN Order_Items oi ON o.order_id = oi.order_id
            JOIN Products p ON oi.product_id = p.product_id
            JOIN Customers c ON o.customer_id = c.customer_id
            WHERE o.status = 'Pending'
        `);
        res.json(results);
    } catch (err) {
        console.error('Error fetching pending order requests:', err);
        res.status(500).json({ error: 'Failed to fetch pending order requests' });
    }
});

// Update order status
app.put('/api/order-requests/:orderId/status', async (req, res) => {
    const { orderId } = req.params;
    const { status } = req.body;

    try {
        await executeQuery(
            `UPDATE Orders SET status = ? WHERE order_id = ?`,
            [status, orderId]
        );

        res.json({ message: `Order ${status} successfully` });
    } catch (err) {
        console.error('Error updating order status:', err);
        res.status(500).json({ error: 'Failed to update order status' });
    }
});

// Get orders by date
app.get('/api/orders/by-date', async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) {
            return res.status(400).json({ error: 'Date parameter is required' });
        }
        
        const results = await executeQuery(`
            SELECT o.order_id, o.status, o.order_date, o.total_amount,
                   c.name AS customer_name, 
                   p.product_name, 
                   oi.quantity, oi.unit_price
            FROM Orders o
            JOIN Order_Items oi ON o.order_id = oi.order_id
            JOIN Products p ON oi.product_id = p.product_id
            JOIN Customers c ON o.customer_id = c.customer_id
            WHERE DATE(o.order_date) = ?
            ORDER BY o.order_date DESC
        `, [date]);
        
        res.json(results);
    } catch (err) {
        console.error('Error fetching orders by date:', err);
        res.status(500).json({ error: 'Failed to fetch orders by date' });
    }
});

// Get daily sales summary
app.get('/api/orders/daily-summary', async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) {
            return res.status(400).json({ error: 'Date parameter is required' });
        }
        
        const results = await executeQuery(`
            SELECT 
                COUNT(*) as order_count,
                COALESCE(SUM(total_amount), 0) as total_sales
            FROM Orders
            WHERE DATE(order_date) = ?
        `, [date]);
        
        res.json(results[0]);
    } catch (err) {
        console.error('Error fetching daily summary:', err);
        res.status(500).json({ error: 'Failed to fetch daily summary' });
    }
});
// Get product statistics by category
app.get('/api/products/category-stats', async (req, res) => {
    try {
        const [results] = await pool.promise().query(`
            SELECT 
                c.category_name,
                COUNT(p.product_id) as product_count,
                SUM(p.quantity) as total_stock
            FROM Categories c
            LEFT JOIN Products p ON c.category_id = p.category_id
            GROUP BY c.category_id, c.category_name
            ORDER BY c.category_name
        `);
        res.json(results);
    } catch (err) {
        console.error('Error fetching category stats:', err);
        res.status(500).json({ error: 'Failed to fetch category statistics' });
    }
});
// Products endpoint
app.get('/api/products', (req, res) => {
    pool.query('SELECT * FROM Products', (err, results) => {
        if (err) return res.json({ success: false });
        res.json(results);
    });
});


// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// Start server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
