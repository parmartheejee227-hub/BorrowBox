import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
import sqlite3
from pathlib import Path
from functools import wraps
from datetime import date

app = Flask(__name__)
CORS(app)

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "borrowbox.db"

SECRET_KEY = os.environ.get("SECRET_KEY", "local-development-secret")
serializer = URLSafeTimedSerializer(SECRET_KEY)


# ---------------- DATABASE ----------------

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def initialize_database():
    conn = get_db()

    conn.executescript("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        phone TEXT DEFAULT '',
        role TEXT NOT NULL DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        price_per_day REAL NOT NULL,
        image_url TEXT DEFAULT '',
        location TEXT NOT NULL,
        available INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(owner_id) REFERENCES users(id),
        FOREIGN KEY(category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL,
        borrower_id INTEGER NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        total_price REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(item_id) REFERENCES items(id),
        FOREIGN KEY(borrower_id) REFERENCES users(id)
    );
        CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER NOT NULL UNIQUE,
        item_id INTEGER NOT NULL,
        reviewer_id INTEGER NOT NULL,
        rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY(booking_id) REFERENCES bookings(id),
        FOREIGN KEY(item_id) REFERENCES items(id),
        FOREIGN KEY(reviewer_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    notification_type TEXT DEFAULT 'general',
    booking_id INTEGER,
    is_read INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(booking_id) REFERENCES bookings(id)
    );
        CREATE TABLE IF NOT EXISTS admin_activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id INTEGER,
        action TEXT NOT NULL,
        target_user_id INTEGER,
        target_user_name TEXT,
        details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(admin_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY(target_user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    """)
        # Add role column to existing databases if it does not exist
    user_columns = [
        row["name"] for row in conn.execute("PRAGMA table_info(users)").fetchall()
    ]

    if "role" not in user_columns:
        conn.execute(
            "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'"
        )
    if "is_active" not in user_columns:
        conn.execute(
        "ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1"
    )
        
    admin_email = os.environ.get("ADMIN_EMAIL", "").strip().lower()

    if admin_email:
        conn.execute(
            "UPDATE users SET role = 'admin' WHERE LOWER(email) = ?",
            (admin_email,)
        )
    conn.commit()

    categories = [
        "Electronics",
        "Photography",
        "Tools",
        "Sports",
        "Camping",
        "Books",
        "Furniture",
        "Other"
    ]

    for category in categories:
        conn.execute(
            "INSERT OR IGNORE INTO categories(name) VALUES (?)",
            (category,)
        )

    conn.commit()
    conn.close()

# ---------------- AUTHENTICATION ----------------

def create_token(user_id):
    return serializer.dumps({"user_id": user_id})

def auth_required(function):
    @wraps(function)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")

        if not header.startswith("Bearer "):
            return jsonify({"error": "Please login first"}), 401

        token = header.split(" ", 1)[1]

        try:
            data = serializer.loads(token, max_age=86400)
            request.user_id = data["user_id"]

        except (BadSignature, SignatureExpired, KeyError):
            return jsonify({"error": "Invalid or expired token"}), 401

        # Check whether user still exists and is active
        conn = get_db()

        user = conn.execute(
            "SELECT is_active FROM users WHERE id = ?",
            (request.user_id,)
        ).fetchone()

        conn.close()

        if not user:
            return jsonify({"error": "User not found"}), 401

        if user["is_active"] == 0:
            return jsonify({
                "error": "Your account has been deactivated"
            }), 403

        return function(*args, **kwargs)

    return wrapper
def admin_required(function):
    @wraps(function)
    @auth_required
    def wrapper(*args, **kwargs):
        conn = get_db()

        user = conn.execute(
            "SELECT role FROM users WHERE id = ?",
            (request.user_id,)
        ).fetchone()

        conn.close()

        if not user or user["role"] != "admin":
            return jsonify({"error": "Admin access required"}), 403

        return function(*args, **kwargs)

    return wrapper

# ---------------- NOTIFICATIONS ----------------

@app.get("/api/notifications")
@auth_required
def get_notifications():
    conn = get_db()

    rows = conn.execute("""
        SELECT *
        FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC
    """, (request.user_id,)).fetchall()

    unread_count = conn.execute("""
        SELECT COUNT(*) AS total
        FROM notifications
        WHERE user_id = ? AND is_read = 0
    """, (request.user_id,)).fetchone()["total"]

    conn.close()

    return jsonify({
        "notifications": [dict(row) for row in rows],
        "unread_count": unread_count
    })


@app.patch("/api/notifications/<int:notification_id>/read")
@auth_required
def mark_notification_read(notification_id):
    conn = get_db()

    cursor = conn.execute("""
        UPDATE notifications
        SET is_read = 1
        WHERE id = ? AND user_id = ?
    """, (notification_id, request.user_id))

    conn.commit()
    conn.close()

    if cursor.rowcount == 0:
        return jsonify({"error": "Notification not found"}), 404

    return jsonify({"message": "Notification marked as read"})


@app.patch("/api/notifications/read-all")
@auth_required
def mark_all_notifications_read():
    conn = get_db()

    conn.execute("""
        UPDATE notifications
        SET is_read = 1
        WHERE user_id = ?
    """, (request.user_id,))

    conn.commit()
    conn.close()

    return jsonify({"message": "All notifications marked as read"})

@app.post("/api/register")
def register():
    data = request.get_json() or {}

    name = data.get("name", "").strip()
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    phone = data.get("phone", "").strip()

    if not name or not email or len(password) < 8:
        return jsonify({
            "error": "Name, valid email and password of at least 8 characters required"
        }), 400

    # Assign admin role only to the configured admin email
    admin_email = os.environ.get("ADMIN_EMAIL", "").strip().lower()
    role = "admin" if email == admin_email and admin_email else "user"

    conn = get_db()

    try:
        cursor = conn.execute("""
            INSERT INTO users(name, email, password, phone, role)
            VALUES (?, ?, ?, ?, ?)
        """, (
            name,
            email,
            generate_password_hash(password),
            phone,
            role
        ))

        user_id = cursor.lastrowid
        conn.commit()

        return jsonify({
            "message": "Registration successful",
            "token": create_token(user_id),
            "user": {
                "id": user_id,
                "name": name,
                "email": email,
                "phone": phone,
                "role": role
            }
        }), 201

    except sqlite3.IntegrityError:
        return jsonify({"error": "Email already registered"}), 409

    finally:
        conn.close()

@app.post("/api/login")
def login():
    data = request.get_json() or {}

    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    conn = get_db()

    try:
        user = conn.execute(
            "SELECT * FROM users WHERE email = ?",
            (email,)
        ).fetchone()

        if not user or not check_password_hash(user["password"], password):
            return jsonify({"error": "Incorrect email or password"}), 401
        # Check whether account is active
        if user["is_active"] == 0:
            return jsonify({
                "error": "Your account has been deactivated. Please contact admin."
            }), 403

        # Promote only the configured admin email
        admin_email = os.environ.get("ADMIN_EMAIL", "").strip().lower()

        if admin_email and email == admin_email:
            conn.execute(
                "UPDATE users SET role = 'admin' WHERE id = ?",
                (user["id"],)
            )
            conn.commit()
            role = "admin"
        else:
            role = user["role"]

        return jsonify({
            "message": "Login successful",
            "token": create_token(user["id"]),
            "user": {
                "id": user["id"],
                "name": user["name"],
                "email": user["email"],
                "phone": user["phone"],
                "role": role
            }
        })

    finally:
        conn.close()

@app.get("/api/me")
@auth_required
def me():
    conn = get_db()

    user = conn.execute("""
    SELECT id, name, email, phone, role
    FROM users WHERE id = ?
""", (request.user_id,)).fetchone()

    conn.close()

    if not user:
        return jsonify({"error": "User not found"}), 404

    return jsonify(dict(user))


# ---------------- CATEGORIES ----------------

@app.get("/api/categories")
def get_categories():
    conn = get_db()

    rows = conn.execute(
        "SELECT * FROM categories ORDER BY name"
    ).fetchall()

    conn.close()

    return jsonify([dict(row) for row in rows])


# ---------------- ITEMS ----------------

@app.get("/api/items")
def get_items():
    search = request.args.get("search", "").strip()
    category = request.args.get("category", "").strip()

    conn = get_db()

    query = """
        SELECT items.*,
               users.name AS owner_name,
               categories.name AS category_name
        FROM items
        JOIN users ON items.owner_id = users.id
        JOIN categories ON items.category_id = categories.id
        WHERE items.available = 1
    """

    params = []

    if search:
        query += """
            AND (
                items.title LIKE ?
                OR items.description LIKE ?
                OR items.location LIKE ?
            )
        """
        term = f"%{search}%"
        params.extend([term, term, term])

    if category:
        query += " AND categories.name = ?"
        params.append(category)

    query += " ORDER BY items.created_at DESC"

    rows = conn.execute(query, params).fetchall()
    conn.close()

    return jsonify([dict(row) for row in rows])


@app.post("/api/items")
@auth_required
def add_item():
    data = request.get_json() or {}

    required = [
        "title", "category_id",
        "price_per_day", "location"
    ]

    if any(not data.get(key) for key in required):
        return jsonify({"error": "Please fill all required fields"}), 400

    try:
        price = float(data["price_per_day"])
        category_id = int(data["category_id"])

        if price <= 0:
            raise ValueError()

    except (ValueError, TypeError):
        return jsonify({"error": "Invalid price or category"}), 400

    conn = get_db()

    category = conn.execute(
        "SELECT id FROM categories WHERE id = ?",
        (category_id,)
    ).fetchone()

    if not category:
        conn.close()
        return jsonify({"error": "Invalid category"}), 400

    cursor = conn.execute("""
        INSERT INTO items(
            owner_id, category_id, title,
            description, price_per_day,
            image_url, location
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        request.user_id,
        category_id,
        data["title"].strip(),
        data.get("description", "").strip(),
        price,
        data.get("image_url", "").strip(),
        data["location"].strip()
    ))

    item_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return jsonify({
        "message": "Item listed successfully",
        "item_id": item_id
    }), 201


@app.delete("/api/items/<int:item_id>")
@auth_required
def delete_item(item_id):
    conn = get_db()

    item = conn.execute("""
        SELECT * FROM items
        WHERE id = ? AND owner_id = ?
    """, (item_id, request.user_id)).fetchone()

    if not item:
        conn.close()
        return jsonify({"error": "Item not found or unauthorized"}), 404

    active = conn.execute("""
        SELECT id FROM bookings
        WHERE item_id = ? AND status IN ('pending', 'approved')
    """, (item_id,)).fetchone()

    if active:
        conn.close()
        return jsonify({
            "error": "Cannot delete an item with active bookings"
        }), 409

    conn.execute("DELETE FROM items WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()

    return jsonify({"message": "Item deleted successfully"})


# ---------------- BOOKINGS ----------------

@app.post("/api/bookings")
@auth_required
def create_booking():
    data = request.get_json() or {}

    try:
        item_id = int(data["item_id"])
        start = date.fromisoformat(data["start_date"])
        end = date.fromisoformat(data["end_date"])

        if start < date.today() or end <= start:
            raise ValueError()

    except (KeyError, ValueError, TypeError):
        return jsonify({"error": "Invalid booking dates"}), 400

    conn = get_db()

    item = conn.execute("""
        SELECT * FROM items
        WHERE id = ? AND available = 1
    """, (item_id,)).fetchone()

    if not item:
        conn.close()
        return jsonify({"error": "Item is unavailable"}), 404

    if item["owner_id"] == request.user_id:
        conn.close()
        return jsonify({"error": "You cannot book your own item"}), 400

    conflict = conn.execute("""
        SELECT id FROM bookings
        WHERE item_id = ?
        AND status = 'approved'
        AND start_date < ?
        AND end_date > ?
    """, (item_id, end.isoformat(), start.isoformat())).fetchone()

    if conflict:
        conn.close()
        return jsonify({"error": "Item already booked for these dates"}), 409

    days = (end - start).days
    total = days * item["price_per_day"]

    cursor = conn.execute("""
        INSERT INTO bookings(
            item_id, borrower_id,
            start_date, end_date,
            total_price, status
        )
        VALUES (?, ?, ?, ?, ?, 'pending')
    """, (
        item_id,
        request.user_id,
        start.isoformat(),
        end.isoformat(),
        total
    ))

    booking_id = cursor.lastrowid
    conn.execute("""
        INSERT INTO notifications (
            user_id, title, message,
            notification_type, booking_id
        )
        VALUES (?, ?, ?, ?, ?)
    """, (
        item["owner_id"],
        "New Booking Request",
        f"Someone requested your item: {item['title']}",
        "booking_request",
        booking_id
    ))

    conn.commit()
    conn.close()

    return jsonify({
        "message": "Booking request submitted",
        "booking_id": booking_id,
        "total_price": total
    }), 201


@app.get("/api/bookings")
@auth_required
def get_bookings():
    conn = get_db()

    rows = conn.execute("""
        SELECT bookings.*,
               items.title AS item_title,
               items.owner_id AS owner_id,
               borrower.name AS borrower_name,
               owner.name AS owner_name
        FROM bookings
        JOIN items ON bookings.item_id = items.id
        JOIN users borrower ON bookings.borrower_id = borrower.id
        JOIN users owner ON items.owner_id = owner.id
        WHERE bookings.borrower_id = ?
           OR items.owner_id = ?
        ORDER BY bookings.created_at DESC
    """, (request.user_id, request.user_id)).fetchall()

    conn.close()

    return jsonify([dict(row) for row in rows])


@app.patch("/api/bookings/<int:booking_id>")
@auth_required
def update_booking(booking_id):
    data = request.get_json() or {}
    action = data.get("action")

    allowed = ["approve", "reject", "complete"]

    if action not in allowed:
        return jsonify({"error": "Invalid action"}), 400

    conn = get_db()

    booking = conn.execute("""
        SELECT bookings.*, items.owner_id
        FROM bookings
        JOIN items ON bookings.item_id = items.id
        WHERE bookings.id = ?
    """, (booking_id,)).fetchone()

    if not booking:
        conn.close()
        return jsonify({"error": "Booking not found"}), 404

    if booking["owner_id"] != request.user_id:
        conn.close()
        return jsonify({"error": "Only item owner can manage bookings"}), 403

    if action == "approve":
        if booking["status"] != "pending":
            conn.close()
            return jsonify({"error": "Only pending bookings can be approved"}), 400

        conflict = conn.execute("""
            SELECT id FROM bookings
            WHERE item_id = ?
            AND status = 'approved'
            AND id != ?
            AND start_date < ?
            AND end_date > ?
        """, (
            booking["item_id"],
            booking_id,
            booking["end_date"],
            booking["start_date"]
        )).fetchone()

        if conflict:
            conn.close()
            return jsonify({"error": "Another booking overlaps these dates"}), 409

        new_status = "approved"

    elif action == "reject":
        if booking["status"] != "pending":
            conn.close()
            return jsonify({"error": "Only pending bookings can be rejected"}), 400

        new_status = "rejected"

    else:
        if booking["status"] != "approved":
            conn.close()
            return jsonify({"error": "Only approved bookings can be completed"}), 400

        new_status = "completed"

    # Update status for all three actions
    conn.execute(
        "UPDATE bookings SET status = ? WHERE id = ?",
        (new_status, booking_id)
    )

    notification_messages = {
        "approved": "Your booking request has been approved!",
        "rejected": "Your booking request has been rejected.",
        "completed": "Your booking has been completed successfully!"
    }

    conn.execute("""
        INSERT INTO notifications (
            user_id, title, message,
            notification_type, booking_id
        )
        VALUES (?, ?, ?, ?, ?)
    """, (
        booking["borrower_id"],
        "Booking Status Updated",
        notification_messages[new_status],
        "booking_update",
        booking_id
    ))

    conn.commit()
    conn.close()

    return jsonify({
        "message": "Booking updated successfully",
        "status": new_status
    })

    conn = get_db()

    booking = conn.execute("""
        SELECT bookings.*, items.owner_id
        FROM bookings
        JOIN items ON bookings.item_id = items.id
        WHERE bookings.id = ?
    """, (booking_id,)).fetchone()

    if not booking:
        conn.close()
        return jsonify({"error": "Booking not found"}), 404

    if booking["owner_id"] != request.user_id:
        conn.close()
        return jsonify({"error": "Only item owner can manage bookings"}), 403

    if action == "approve":
        if booking["status"] != "pending":
            conn.close()
            return jsonify({"error": "Only pending bookings can be approved"}), 400

        conflict = conn.execute("""
            SELECT id FROM bookings
            WHERE item_id = ?
            AND status = 'approved'
            AND id != ?
            AND start_date < ?
            AND end_date > ?
        """, (
            booking["item_id"],
            booking_id,
            booking["end_date"],
            booking["start_date"]
        )).fetchone()

        if conflict:
            conn.close()
            return jsonify({"error": "Another booking overlaps these dates"}), 409

        new_status = "approved"

    elif action == "reject":
        if booking["status"] != "pending":
            conn.close()
            return jsonify({"error": "Only pending bookings can be rejected"}), 400

        new_status = "rejected"

    else:
        if booking["status"] != "approved":
            conn.close()
            return jsonify({"error": "Only approved bookings can be completed"}), 400

        new_status = "completed"

        conn.execute(
        "UPDATE bookings SET status = ? WHERE id = ?",
        (new_status, booking_id)
    )

    notification_messages = {
        "approved": "Your booking request has been approved!",
        "rejected": "Your booking request has been rejected.",
        "completed": "Your booking has been completed successfully!"
    }

    conn.execute("""
        INSERT INTO notifications (
            user_id, title, message,
            notification_type, booking_id
        )
        VALUES (?, ?, ?, ?, ?)
    """, (
        booking["borrower_id"],
        "Booking Status Updated",
        notification_messages[new_status],
        "booking_update",
        booking_id
    ))

    conn.commit()
    conn.close()

    return jsonify({
        "message": "Booking updated successfully",
        "status": new_status
    })

# ---------------- REVIEWS ----------------

@app.post("/api/reviews")
@auth_required
def create_review():
    data = request.get_json() or {}

    booking_id = data.get("booking_id")
    rating = data.get("rating")
    comment = str(data.get("comment", "")).strip()

    if type(booking_id) is not int or booking_id <= 0:
        return jsonify({"error": "Invalid booking ID"}), 400

    if type(rating) is not int or rating < 1 or rating > 5:
        return jsonify({"error": "Rating must be between 1 and 5"}), 400

    conn = get_db()

    booking = conn.execute("""
        SELECT id, item_id, borrower_id, status
        FROM bookings
        WHERE id = ?
    """, (booking_id,)).fetchone()

    if not booking:
        conn.close()
        return jsonify({"error": "Booking not found"}), 404

    if booking["borrower_id"] != request.user_id:
        conn.close()
        return jsonify({"error": "Only the borrower can review"}), 403

    if booking["status"] != "completed":
        conn.close()
        return jsonify({
            "error": "Only completed bookings can be reviewed"
        }), 400

    existing = conn.execute(
        "SELECT id FROM reviews WHERE booking_id = ?",
        (booking_id,)
    ).fetchone()

    if existing:
        conn.close()
        return jsonify({"error": "You have already reviewed this booking"}), 409

    conn.execute("""
        INSERT INTO reviews (
            booking_id, item_id, reviewer_id, rating, comment
        )
        VALUES (?, ?, ?, ?, ?)
    """, (
        booking_id,
        booking["item_id"],
        request.user_id,
        rating,
        comment
    ))

    conn.commit()
    conn.close()

    return jsonify({
        "message": "Review submitted successfully"
    }), 201
@app.get("/api/items/<int:item_id>/reviews")
def get_item_reviews(item_id):
    conn = get_db()

    reviews = conn.execute("""
        SELECT
            reviews.id,
            reviews.rating,
            reviews.comment,
            reviews.created_at,
            users.name AS reviewer_name
        FROM reviews
        JOIN users ON reviews.reviewer_id = users.id
        WHERE reviews.item_id = ?
        ORDER BY reviews.created_at DESC
    """, (item_id,)).fetchall()

    summary = conn.execute("""
        SELECT
            COUNT(*) AS total_reviews,
            ROUND(AVG(rating), 1) AS average_rating
        FROM reviews
        WHERE item_id = ?
    """, (item_id,)).fetchone()

    conn.close()

    return jsonify({
        "reviews": [dict(row) for row in reviews],
        "total_reviews": summary["total_reviews"],
        "average_rating": summary["average_rating"] or 0
    })
# ---------------- DASHBOARD ----------------

@app.get("/api/dashboard")
@auth_required
def dashboard():
    conn = get_db()
    user_id = request.user_id

    items = conn.execute("""
        SELECT COUNT(*) AS total
        FROM items WHERE owner_id = ?
    """, (user_id,)).fetchone()["total"]

    borrowed = conn.execute("""
        SELECT COUNT(*) AS total
        FROM bookings WHERE borrower_id = ?
    """, (user_id,)).fetchone()["total"]

    pending = conn.execute("""
        SELECT COUNT(*) AS total
        FROM bookings
        JOIN items ON bookings.item_id = items.id
        WHERE items.owner_id = ? AND bookings.status = 'pending'
    """, (user_id,)).fetchone()["total"]

    earnings = conn.execute("""
        SELECT COALESCE(SUM(bookings.total_price), 0) AS total
        FROM bookings
        JOIN items ON bookings.item_id = items.id
        WHERE items.owner_id = ? AND bookings.status = 'completed'
    """, (user_id,)).fetchone()["total"]

    conn.close()

    return jsonify({
        "total_listings": items,
        "total_borrowed": borrowed,
        "pending_requests": pending,
        "total_earnings": earnings
    })


@app.get("/api/health")
def health():
    return jsonify({
        "status": "healthy",
        "application": "BorrowBox API"
    })
# ---------------- ADMIN DASHBOARD ----------------


@app.get("/api/admin/overview")
@admin_required
def admin_overview():
    conn = get_db()

    # User Statistics
    total_users = conn.execute(
        "SELECT COUNT(*) AS total FROM users"
    ).fetchone()["total"]

    active_users = conn.execute(
        "SELECT COUNT(*) AS total FROM users WHERE is_active = 1"
    ).fetchone()["total"]

    inactive_users = conn.execute(
        "SELECT COUNT(*) AS total FROM users WHERE is_active = 0"
    ).fetchone()["total"]

    admin_users = conn.execute(
        "SELECT COUNT(*) AS total FROM users WHERE role = 'admin'"
    ).fetchone()["total"]

    # Item Statistics
    total_items = conn.execute(
        "SELECT COUNT(*) AS total FROM items"
    ).fetchone()["total"]

    # Booking Statistics
    total_bookings = conn.execute(
        "SELECT COUNT(*) AS total FROM bookings"
    ).fetchone()["total"]

    pending_bookings = conn.execute(
        "SELECT COUNT(*) AS total FROM bookings WHERE status = 'pending'"
    ).fetchone()["total"]

    approved_bookings = conn.execute(
        "SELECT COUNT(*) AS total FROM bookings WHERE status = 'approved'"
    ).fetchone()["total"]

    completed_bookings = conn.execute(
        "SELECT COUNT(*) AS total FROM bookings WHERE status = 'completed'"
    ).fetchone()["total"]

    # Recent Bookings
    recent_bookings = conn.execute("""
        SELECT
            bookings.id,
            items.title AS item_title,
            borrower.name AS borrower_name,
            owner.name AS owner_name,
            bookings.total_price,
            bookings.status,
            bookings.created_at
        FROM bookings
        JOIN items ON bookings.item_id = items.id
        JOIN users borrower ON bookings.borrower_id = borrower.id
        JOIN users owner ON items.owner_id = owner.id
        ORDER BY bookings.created_at DESC
        LIMIT 10
    """).fetchall()

    conn.close()

    return jsonify({
        "total_users": total_users,
        "active_users": active_users,
        "inactive_users": inactive_users,
        "admin_users": admin_users,
        "total_items": total_items,
        "total_bookings": total_bookings,
        "pending_bookings": pending_bookings,
        "approved_bookings": approved_bookings,
        "completed_bookings": completed_bookings,
        "recent_bookings": [dict(row) for row in recent_bookings]
    })
# ---------------- ADMIN USER MANAGEMENT ----------------

@app.get("/api/admin/users")
@admin_required
def admin_get_users():
    search = request.args.get("search", "").strip()

    conn = get_db()

    users = conn.execute("""
        SELECT id, name, email, phone, role, is_active, created_at
        FROM users
        WHERE name LIKE ? OR email LIKE ?
        ORDER BY created_at DESC
    """, (f"%{search}%", f"%{search}%")).fetchall()

    total_users = conn.execute(
        "SELECT COUNT(*) AS total FROM users"
    ).fetchone()["total"]

    conn.close()

    return jsonify({
        "users": [dict(user) for user in users],
        "total_users": total_users
    })


# ---------------- UPDATE USER STATUS ----------------

@app.patch("/api/admin/users/<int:user_id>/status")
@admin_required
def update_user_status(user_id):
    data = request.get_json() or {}
    is_active = data.get("is_active")

    if type(is_active) is not int or is_active not in (0, 1):
        return jsonify({"error": "Invalid account status"}), 400

    conn = get_db()

    target_user = conn.execute(
        "SELECT id, name, role, is_active FROM users WHERE id = ?",
        (user_id,)
    ).fetchone()

    if not target_user:
        conn.close()
        return jsonify({"error": "User not found"}), 404

    if target_user["role"] == "admin":
        conn.close()
        return jsonify({
            "error": "Admin accounts cannot be deactivated"
        }), 403

    # Update user status
    conn.execute(
        "UPDATE users SET is_active = ? WHERE id = ?",
        (is_active, user_id)
    )

    # Save activity only when status actually changes
    if target_user["is_active"] != is_active:
        action = "Activated user" if is_active == 1 else "Deactivated user"

        details = f"{action}: {target_user['name']}"

        conn.execute("""
            INSERT INTO admin_activity_logs
            (admin_id, action, target_user_id, target_user_name, details)
            VALUES (?, ?, ?, ?, ?)
        """, (
            request.user_id,
            action,
            user_id,
            target_user["name"],
            details
        ))

    conn.commit()
    conn.close()

    return jsonify({
        "message": "User status updated successfully",
        "user_id": user_id,
        "is_active": is_active
    })
@app.get("/api/admin/activity-logs")
@admin_required
def get_admin_activity_logs():
    conn = get_db()

    activities = conn.execute("""
        SELECT
            logs.id,
            logs.action,
            logs.target_user_name,
            logs.details,
            logs.created_at,
            users.name AS admin_name
        FROM admin_activity_logs AS logs
        LEFT JOIN users
        ON users.id = logs.admin_id
        ORDER BY logs.created_at DESC
        LIMIT 50
    """).fetchall()

    conn.close()

    return jsonify({
        "activities": [dict(row) for row in activities]
    })
# ---------------- START SERVER ----------------

initialize_database()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
