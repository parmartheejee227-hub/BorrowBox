import { useState, useEffect } from "react";

import {
  Search, Plus, Bell, User, Package, CalendarDays,
  LayoutDashboard, Compass, LogOut, Menu, X,
  CheckCircle, Clock, IndianRupee, MapPin,
  Heart, ArrowRight, SlidersHorizontal, BookOpen,
  Wrench, Camera, Dumbbell, Tent, Home, Music,
  Sparkles, ChevronRight
} from "lucide-react";
import "./App.css";

const API = "https://borrowbox-api-i230.onrender.com/api";

const categoryIcons = [
  Wrench, Camera, BookOpen, Dumbbell,
  Tent, Home, Music, Package
];

export default function App() {
  const [user, setUser] = useState(null);
  const [adminData, setAdminData] = useState(null);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminActivities, setAdminActivities] = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [bookings, setBookings] = useState([]);
  const [bookingSearch, setBookingSearch] = useState("");
  const [bookingStatusFilter, setBookingStatusFilter] = useState("all");
  const [bookingDateFilter, setBookingDateFilter] = useState("");
  const [page, setPage] = useState("dashboard");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [reviewForms, setReviewForms] = useState({});

  const [form, setForm] = useState({
    title: "",
    description: "",
    category_id: "",
    price_per_day: "",
    location: ""
  });

  const token = localStorage.getItem("borrowbox_token");

  async function request(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || "Request failed");
    }

    return data;
  }

  async function refresh() {
    try {
      setLoading(true);

      const [me, itemData, categoryData, bookingData, notificationData] =
  await Promise.all([
    request("/me"),
    request("/items"),
    request("/categories"),
    request("/bookings"),
    request("/notifications")
  ]);

      setUser(me.user || me);
      setItems(itemData.items || itemData);
      setCategories(categoryData.categories || categoryData);
      setBookings(bookingData.bookings || bookingData);
      setNotifications(notificationData.notifications || []);
      setUnreadCount(notificationData.unread_count || 0);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  async function submitReview(bookingId, rating, comment) {
  try {
    await request("/reviews", {
      method: "POST",
      body: JSON.stringify({
        booking_id: Number(bookingId),
        rating: Number(rating),
        comment: comment.trim()
      })
    });

    alert("Review submitted successfully!");

    setReviewForms(prev => ({
      ...prev,
      [bookingId]: {
        rating: 5,
        comment: "",
        submitted: true
      }
    }));
  } catch (err) {
    alert(err.message);
  }
}
  async function loadAdminOverview() {
  try {
    const data = await request("/admin/overview");
    setAdminData(data);
    return data;
  } catch (err) {
    setError(err.message);
    return null;
  }
}
async function loadAdminUsers(search = "") {
  try {
    const data = await request(
      `/admin/users?search=${encodeURIComponent(search)}`
    );

    setAdminUsers(data.users || []);
  } catch (err) {
    setError(err.message);
  }
}
async function loadAdminActivities() {
  try {
    const data = await request("/admin/activity-logs");
    setAdminActivities(data.activities || []);
  } catch (err) {
    setError(err.message);
  }
}

  useEffect(() => {
    if (token) refresh();
  }, []);
  

  async function login(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    try {
      const result = await request("/login", {
        method: "POST",
        body: JSON.stringify({
          email: data.get("email"),
          password: data.get("password")
        })
      });

      localStorage.setItem("borrowbox_token", result.token);
      window.location.reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function register(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    try {
      const result = await request("/register", {
        method: "POST",
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          password: data.get("password")
        })
      });

      localStorage.setItem("borrowbox_token", result.token);
      window.location.reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function addItem(event) {
    event.preventDefault();

    try {
      await request("/items", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          price_per_day: Number(form.price_per_day),
          category_id: Number(form.category_id)
        })
      });

      setShowForm(false);
      setForm({
        title: "",
        description: "",
        category_id: "",
        price_per_day: "",
        location: ""
      });

      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }



async function bookItem(itemId) {
  const start_date = prompt("Start date (YYYY-MM-DD):");
  if (!start_date) return;

  const end_date = prompt("End date (YYYY-MM-DD):");
  if (!end_date) return;

  const idChoice = prompt(
    "Select ID proof for demo verification:\n1. PAN Card\n2. Aadhaar Card\n\nEnter 1 or 2:"
  );

  if (idChoice !== "1" && idChoice !== "2") {
    alert("Please select a valid ID proof.");
    return;
  }

  const idType = idChoice === "1" ? "PAN Card" : "Aadhaar Card";

  try {
    // Get the booking ID returned by backend
    const response = await request("/bookings", {
      method: "POST",
      body: JSON.stringify({
        item_id: itemId,
        start_date,
        end_date
      })
    });

    // Store demo verification using booking_id
    const verificationData = JSON.parse(
      localStorage.getItem("borrowbox_demo_verification") || "{}"
    );

    verificationData[response.booking_id] = {
      idType,
      status: "active"
    };

    localStorage.setItem(
      "borrowbox_demo_verification",
      JSON.stringify(verificationData)
    );

    alert(
      `Booking request sent successfully!\n\n` +
      `Booking ID: ${response.booking_id}\n` +
      `ID Proof: ${idType}\n` +
      `Verification: Demo only\n` +
      `Status: Active until item return.`
    );

    await refresh();
  } catch (err) {
    setError(err.message);
  }
}

  async function updateBooking(id, status) {
    try {
      const action =
        status === "approved" ? "approve" :
        status === "rejected" ? "reject" :
        "complete";

      await request(`/bookings/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action })
      });

      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  function logout() {
    localStorage.removeItem("borrowbox_token");
    window.location.reload();
  }

  function toggleFavorite(id) {
    setFavorites(previous =>
      previous.includes(id)
        ? previous.filter(itemId => itemId !== id)
        : [...previous, id]
    );
  }

  const myItems = items.filter(item => item.owner_id === user?.id);
  const myBookings = bookings.filter(b => b.borrower_id === user?.id);
  const requests = bookings.filter(b => b.owner_id === user?.id);
  const filteredBookings = bookings.filter(b => {
  const matchesSearch =
    String(b.id).includes(bookingSearch.trim()) ||
    (b.item_title || "")
      .toLowerCase()
      .includes(bookingSearch.trim().toLowerCase());

  const matchesStatus =
    bookingStatusFilter === "all" ||
    b.status === bookingStatusFilter;

  const matchesDate =
    !bookingDateFilter ||
    b.start_date === bookingDateFilter;

  return matchesSearch && matchesStatus && matchesDate;
});

const allMyBookings = bookings;

const bookingStats = {
  total: allMyBookings.length,
  pending: allMyBookings.filter(b => b.status === "pending").length,
  approved: allMyBookings.filter(b => b.status === "approved").length,
  rejected: allMyBookings.filter(b => b.status === "rejected").length,
  completed: allMyBookings.filter(b => b.status === "completed").length
};

const totalTransactionAmount = allMyBookings
  .filter(b => b.status === "completed")
  .reduce((sum, b) => sum + Number(b.total_price || 0), 0);


  const filteredItems = items.filter(item => {
    const matchesSearch =
      `${item.title} ${item.description} ${item.category_name || ""}`
        .toLowerCase()
        .includes(search.toLowerCase());

    const matchesCategory =
      selectedCategory === "All" ||
      item.category_name === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  if (!token || (!user && !loading)) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="brand-mark">B</div>
          <h1>BorrowBox</h1>
          <p className="auth-tagline">Own less. Live more.</p>

          <div className="auth-columns">
            <form onSubmit={login}>
              <h2>Welcome back</h2>
              <p>Login to your BorrowBox account.</p>
              <input
                name="email"
                type="email"
                placeholder="Email address"
                required
              />
              <input
                name="password"
                type="password"
                placeholder="Password"
                required
              />
              <button className="primary-btn">Login</button>
            </form>

            <form onSubmit={register}>
              <h2>Create account</h2>
              <p>Join your local sharing community.</p>
              <input
                name="name"
                placeholder="Full name"
                required
              />
              <input
                name="email"
                type="email"
                placeholder="Email address"
                required
              />
              <input
                name="password"
                type="password"
                placeholder="Password (min 6 characters)"
                minLength="6"
                required
              />
              <button className="primary-btn">Create account</button>
            </form>
          </div>

          {error && <p className="error">{error}</p>}
          <small>BorrowBox · Community sharing marketplace</small>
        </div>
      </div>
    );
  }

  if (!user) {
    return <div className="loading-screen">Loading BorrowBox...</div>;
  }

  function navigate(nextPage) {
    setPage(nextPage);
    setMobileMenu(false);
    setSearch("");
    setSelectedCategory("All");
  }

  return (
    <div className="app-shell">

      <div className="prototype-bar">
        <Sparkles size={15} />
        <span>
          Welcome to BorrowBox — Your community sharing marketplace.
          Share more, waste less!
        </span>
      </div>

      <header className="topbar">
        <div
          className="brand"
          onClick={() => navigate("dashboard")}
        >
          <span className="brand-mark">B</span>
          <b>BorrowBox</b>
        </div>

        <button
          className="mobile-menu-btn"
          onClick={() => setMobileMenu(!mobileMenu)}
        >
          {mobileMenu ? <X /> : <Menu />}
        </button>

        <nav className={mobileMenu ? "nav-open" : ""}>
          <button
            className={page === "explore" ? "active" : ""}
            onClick={() => navigate("explore")}
          >
            Explore
          </button>

          <button
            className={page === "categories" ? "active" : ""}
            onClick={() => navigate("categories")}
          >
            Categories
          </button>

          <button onClick={() => navigate("how-it-works")}>
            How It Works
          </button>

          <button onClick={() => navigate("community")}>
            Community
          </button>
          {user?.role === "admin" && (
  <button
    className={page === "admin" ? "active" : ""}
    onClick={() => navigate("admin")}
  >
    Admin Dashboard
  </button>
)}
        </nav>

        <div className="top-actions">
          <button
            className="header-search-btn"
            onClick={() => navigate("explore")}
          >
            <Search size={17} />
            Search
          </button>

          <button
            className="primary-btn header-list-btn"
            onClick={() => setShowForm(true)}
          >
            <Plus size={17} /> List an Item
          </button>

          <button
  className="icon-btn notification-btn"
  title="Notifications"
  onClick={() => navigate("notifications")}
>
  <Bell size={19} />

  {unreadCount > 0 && (
    <span className="notification-badge">
      {unreadCount > 9 ? "9+" : unreadCount}
    </span>
  )}
</button>

          <button
            className="profile-btn"
            title={user.name}
            onClick={() => navigate("profile")}
          >
            <User size={18} />
          </button>

          <button
            className="icon-btn"
            title="Logout"
            onClick={logout}
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="main-content">

        {error && <p className="error">{error}</p>}

        {page === "dashboard" && (
          <>
            <section className="dashboard-welcome">
              <div>
                <span className="eyebrow">YOUR BORROWBOX SPACE</span>
                <h1>Hello, {user.name}! <span>👋</span></h1>
                <p>Good things are closer than you think.</p>
              </div>

              <button
                className="primary-btn"
                onClick={() => setShowForm(true)}
              >
                <Plus size={18} /> List an Item
              </button>
            </section>

            <div className="dashboard-search">
              <Search size={21} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                onFocus={() => setPage("explore")}
                placeholder="What are you looking for today?"
              />
              <button onClick={() => navigate("explore")}>
                Explore
              </button>
            </div>

            <section className="stats-grid">
              <Stat
                icon={<Package />}
                label="Available items"
                value={items.length}
              />
              <Stat
                icon={<CalendarDays />}
                label="My bookings"
                value={myBookings.length}
              />
              <Stat
                icon={<Clock />}
                label="Booking requests"
                value={requests.length}
              />
              <Stat
                icon={<CheckCircle />}
                label="My listings"
                value={myItems.length}
              />
            </section>

            <section className="content-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">FIND WHAT YOU NEED</span>
                  <h2>Explore categories</h2>
                </div>
                <button onClick={() => navigate("categories")}>
                  View all <ArrowRight size={16} />
                </button>
              </div>

              <CategoryGrid
                categories={categories}
                onSelect={name => {
                  setSelectedCategory(name);
                  navigate("explore");
                }}
              />
            </section>

            <section className="content-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">SHARED BY YOUR COMMUNITY</span>
                  <h2>Discover something useful</h2>
                </div>
                <button onClick={() => navigate("explore")}>
                  Explore all <ArrowRight size={16} />
                </button>
              </div>

              <ItemGrid
                items={filteredItems.slice(0, 6)}
                onBook={bookItem}
                favorites={favorites}
                onFavorite={toggleFavorite}
              />
            </section>

            <section className="activity-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">YOUR ACTIVITY</span>
                  <h2>Recent bookings</h2>
                </div>
                <button onClick={() => navigate("bookings")}>
                  View bookings <ArrowRight size={16} />
                </button>
              </div>

              {myBookings.length === 0 ? (
                <div className="empty-state">
                  <CalendarDays size={30} />
                  <h3>No bookings yet</h3>
                  <p>Explore items and send your first borrowing request.</p>
                  <button
                    className="primary-btn"
                    onClick={() => navigate("explore")}
                  >
                    Explore items
                  </button>
                </div>
              ) : (
                myBookings.slice(0, 4).map(b => (
                  <BookingRow key={b.id} booking={b} />
                ))
              )}
            </section>
          </>
        )}

        {page === "explore" && (
          <>
            <section className="explore-hero">
              <span className="eyebrow">THE NEIGHBOURHOOD SHARING MARKETPLACE</span>
              <h1>Good things are closer than you think.</h1>
              <p>
                Borrow what you need from people nearby.
                Share what you own. Make your community stronger.
              </p>

              <div className="hero-search">
                <Search size={21} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search cameras, tools, books..."
                />
                <button onClick={() => setSelectedCategory("All")}>
                  Search
                </button>
              </div>
            </section>

            <section className="content-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">BROWSE BY INTEREST</span>
                  <h2>Explore categories</h2>
                </div>
              </div>

              <CategoryGrid
                categories={categories}
                onSelect={setSelectedCategory}
              />
            </section>

            <section className="content-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">AVAILABLE NEAR YOU</span>
                  <h2>Explore items</h2>
                </div>
                <span className="results-count">
                  {filteredItems.length} items
                </span>
              </div>

              
<div className="explore-filter-toolbar">
  <div className="filter-left">
    <SlidersHorizontal size={18} />

    <select aria-label="Sort items">
      <option>Nearest first</option>
      <option>Recently added</option>
    </select>

    <select aria-label="Distance">
      <option>Any distance</option>
      <option>Within 5 km</option>
      <option>Within 10 km</option>
      <option>Within 20 km</option>
    </select>

    <button
      className={selectedCategory === "All" ? "filter-active" : ""}
      onClick={() => setSelectedCategory("All")}
    >
      All items
    </button>

    {categories.map(c => (
      <button
        key={c.id}
        className={selectedCategory === c.name ? "filter-active" : ""}
        onClick={() => setSelectedCategory(c.name)}
      >
        {c.name}
      </button>
    ))}
  </div>
</div>

              <ItemGrid
                items={filteredItems}
                onBook={bookItem}
                favorites={favorites}
                onFavorite={toggleFavorite}
              />
            </section>
          </>
        )}

        {page === "categories" && (
          <section className="content-section">
            <span className="eyebrow">FIND YOUR NEXT BORROW</span>
            <h1>Browse all categories</h1>
            <p className="page-description">
              Discover useful things shared by your community.
            </p>
            <CategoryGrid
              categories={categories}
              onSelect={name => {
                setSelectedCategory(name);
                navigate("explore");
              }}
            />
          </section>
        )}

        {page === "my-items" && (
          <section className="content-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">YOUR SHARED ITEMS</span>
                <h1>My Listings</h1>
              </div>
              <button
                className="primary-btn"
                onClick={() => setShowForm(true)}
              >
                <Plus size={17} /> Add Item
              </button>
            </div>
            <ItemGrid
              items={myItems}
              onBook={bookItem}
              own
              favorites={favorites}
              onFavorite={toggleFavorite}
            />
          </section>
        )}

        {page === "bookings" && (
          <section className="content-section">
            <span className="eyebrow">YOUR BORROWING ACTIVITY</span>
            <h1>My bookings</h1>
            
<div className="booking-stats-grid">
  <div className="booking-stat-card">
    <span>Total Bookings</span>
    <h2>{bookingStats.total}</h2>
  </div>

  <div className="booking-stat-card">
    <span>Pending</span>
    <h2>{bookingStats.pending}</h2>
  </div>

  <div className="booking-stat-card">
    <span>Approved</span>
    <h2>{bookingStats.approved}</h2>
  </div>

  <div className="booking-stat-card">
    <span>Rejected</span>
    <h2>{bookingStats.rejected}</h2>
  </div>

  <div className="booking-stat-card">
    <span>Completed</span>
    <h2>{bookingStats.completed}</h2>
  </div>

  <div className="booking-stat-card">
    <span>Completed Transaction Value</span>
    <h2>₹{totalTransactionAmount.toLocaleString("en-IN")}</h2>
  </div>
</div>


<h2 className="subheading">Transaction History</h2>
<div className="booking-filter-toolbar">
  <input
    type="text"
    placeholder="Search by Booking ID or Item Name..."
    value={bookingSearch}
    onChange={e => setBookingSearch(e.target.value)}
  />

  <select
    value={bookingStatusFilter}
    onChange={e => setBookingStatusFilter(e.target.value)}
  >
    <option value="all">All Status</option>
    <option value="pending">Pending</option>
    <option value="approved">Approved</option>
    <option value="rejected">Rejected</option>
    <option value="completed">Completed</option>
  </select>

  <input
    type="date"
    value={bookingDateFilter}
    onChange={e => setBookingDateFilter(e.target.value)}
  />

  <button
    type="button"
    onClick={() => {
      setBookingSearch("");
      setBookingStatusFilter("all");
      setBookingDateFilter("");
    }}
  >
    Clear Filters
  </button>
</div>

<div className="transaction-table-wrapper">
  <table className="transaction-table">
    <thead>
      <tr>
        <th>Booking ID</th>
        <th>Item</th>
        <th>Borrower</th>
        <th>Owner</th>
        <th>Booking Dates</th>
        <th>Amount</th>
        <th>Status</th>
      </tr>
    </thead>

    <tbody>
      {bookings.length === 0 ? (
        <tr>
          <td colSpan="7">No transaction records found.</td>
        </tr>
      ) : (
        filteredBookings.map(b => (
          <tr key={b.id}>
            <td>#{b.id}</td>
            <td>{b.item_title}</td>
            <td>{b.borrower_name}</td>
            <td>{b.owner_name}</td>
            <td>
              {b.start_date} – {b.end_date}
            </td>
            <td>
              ₹{Number(b.total_price || 0).toLocaleString("en-IN")}
            </td>
            <td>
              <span className={`status ${b.status}`}>
                {b.status}
              </span>
            </td>
          </tr>
        ))
      )}
    </tbody>
  </table>
</div>

          <h2 className="subheading">Items I've requested</h2>

{myBookings.length === 0
  ? <p>No bookings found.</p>
  : myBookings.map(b => (
      <BookingRow
        key={b.id}
        booking={b}
        reviewForm={reviewForms[b.id]}
        onSubmitReview={submitReview}
      />
    ))
}

            <h2 className="subheading">Requests for my items</h2>

            {requests.length === 0
              ? <p>No booking requests found.</p>
              : requests.map(b => (
                  <div className="booking-row" key={b.id}>
                    <div>
                      <b>{b.item_title}</b>
                      <p>{b.start_date} to {b.end_date}</p>
                    </div>

                    <span className={`status ${b.status}`}>
                      {b.status}
                    </span>

                    {b.status === "pending" && (
                      <>
                        <button onClick={() => updateBooking(b.id, "approved")}>
                          Approve
                        </button>
                        <button onClick={() => updateBooking(b.id, "rejected")}>
                          Reject
                        </button>
                      </>
                    )}

                    {b.status === "approved" && (
                      <button onClick={() => updateBooking(b.id, "completed")}>
                        Complete Booking
                      </button>
                    )}
                  </div>
                ))
            }
          </section>
        )}
        {page === "admin" && user?.role === "admin" && (
  <section className="content-section">
    <span className="eyebrow">BORROWBOX MANAGEMENT</span>
    <h1>Admin Dashboard</h1>
    
    <p className="page-description">
      Monitor users, listings and booking activity.
    </p>

    <button
  className="primary-btn"
  onClick={loadAdminOverview}
>
  <LayoutDashboard size={17} /> Refresh Statistics
  </button>
  <button
  className="primary-btn"
  onClick={() => {
    loadAdminUsers(userSearch);
    setPage("users");
  }}
>
  <User size={17} /> Manage Users
</button>
      {adminData && (
      <div className="stats-grid">
        <div className="stat-card">
          <span>Total Users</span>
          <h2>{adminData.total_users}</h2>
        </div>

        <div className="stat-card">
          <div className="stat-card">
  <span>Active Users</span>
  <h2>{adminData.active_users}</h2>
</div>

<div className="stat-card">
  <span>Inactive Users</span>
  <h2>{adminData.inactive_users}</h2>
</div>

<div className="stat-card">
  <span>Admin Users</span>
  <h2>{adminData.admin_users}</h2>
</div>
          <span>Total Items</span>
          <h2>{adminData.total_items}</h2>
        </div>

        <div className="stat-card">
          <span>Total Bookings</span>
          <h2>{adminData.total_bookings}</h2>
        </div>

        <div className="stat-card">
          <span>Pending Bookings</span>
          <h2>{adminData.pending_bookings}</h2>
        </div>

        <div className="stat-card">
          <span>Approved Bookings</span>
          <h2>{adminData.approved_bookings}</h2>
        </div>

        <div className="stat-card">
          <span>Completed Bookings</span>
          <h2>{adminData.completed_bookings}</h2>
        </div>
      </div>
    )}
    {adminData && (
  <div className="admin-recent-bookings">
    <h2>Recent Bookings</h2>

    {adminData.recent_bookings.length === 0 ? (
      <p>No bookings available yet.</p>
    ) : (
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Borrower</th>
              <th>Owner</th>
              <th>Price</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {adminData.recent_bookings.map((booking) => (
              <tr key={booking.id}>
                <td>{booking.item_title}</td>
                <td>{booking.borrower_name}</td>
                <td>{booking.owner_name}</td>
                <td>₹{booking.total_price}</td>
                <td>{booking.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
)}
<div className="admin-recent-bookings">
  <div className="section-heading">
    <div>
      <span className="eyebrow">ADMIN HISTORY</span>
      <h2>Admin Activity Logs</h2>
    </div>

    <button
      className="primary-btn"
      onClick={loadAdminActivities}
    >
      Refresh Logs
    </button>
  </div>

  {adminActivities.length === 0 ? (
    <p>No admin activities recorded yet.</p>
  ) : (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Admin</th>
            <th>Action</th>
            <th>Target User</th>
            <th>Details</th>
            <th>Date & Time</th>
          </tr>
        </thead>

        <tbody>
          {adminActivities.map(activity => (
            <tr key={activity.id}>
              <td>{activity.admin_name || "Unknown"}</td>
              <td>{activity.action}</td>
              <td>{activity.target_user_name || "Unknown"}</td>
              <td>{activity.details}</td>
              <td>{activity.created_at}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}
</div>
  </section>
)}

{page === "users" && user?.role === "admin" && (
  <section className="content-section">
    <span className="eyebrow">BORROWBOX MANAGEMENT</span>
    <h1>User Management</h1>
    <p className="page-description">
      View and manage all registered BorrowBox users.
    </p>

    <div className="hero-search">
      <Search size={20} />
      <input
        type="text"
        placeholder="Search users by name or email..."
        value={userSearch}
        onChange={(e) => {
          setUserSearch(e.target.value);
          loadAdminUsers(e.target.value);
        }}
      />
    </div>

    <div className="admin-recent-bookings">
      <h2>Registered Users ({adminUsers.length})</h2>

      {adminUsers.length === 0 ? (
        <p>No users found.</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Joined</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {adminUsers.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.phone || "N/A"}</td>
                  <td>{u.role}</td>
                  <td>{u.created_at}</td>
                  <td>
  <span className={`status-badge ${u.is_active ? "active" : "inactive"}`}>
    {u.is_active ? "Active" : "Inactive"}
  </span>
</td>

<td>
  {u.role === "admin" ? (
    <span>Protected</span>
  ) : (
    <button
      className="primary-btn"
      onClick={async () => {
        try {
          await request(`/admin/users/${u.id}/status`, {
            method: "PATCH",
            body: JSON.stringify({
              is_active: u.is_active ? 0 : 1
            })
          });

          loadAdminUsers(userSearch);
        } catch (err) {
          setError(err.message);
        }
      }}
    >
      {u.is_active ? "Deactivate" : "Activate"}
    </button>
  )}
</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  </section>
)}
        {page === "profile" && (
          <section className="profile-card">
            <div className="profile-avatar"><User size={35} /></div>
            <span className="eyebrow">YOUR ACCOUNT</span>
            <h1>{user.name}</h1>
            <p>{user.email}</p>
            <button className="primary-btn" onClick={logout}>
              <LogOut size={17} /> Logout
            </button>
          </section>
        )}
                {page === "notifications" && (
          <section className="content-section info-page">
            <div className="section-heading">
              <div>
                <span className="eyebrow">YOUR ACTIVITY</span>
                <h1>Notifications</h1>
                <p>You have {unreadCount} unread notifications.</p>
              </div>

              {unreadCount > 0 && (
                <button
                  className="primary-btn"
                  onClick={async () => {
                    try {
                      await request("/notifications/read-all", {
                        method: "PATCH"
                      });
                      setNotifications(prev =>
                        prev.map(n => ({ ...n, is_read: 1 }))
                      );
                      setUnreadCount(0);
                    } catch (err) {
                      setError(err.message);
                    }
                  }}
                >
                  Mark all as read
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <p>No notifications yet.</p>
            ) : (
              <div className="notification-list">
                {notifications.map(n => (
                  <div
                    key={n.id}
                    className={`notification-card ${n.is_read ? "read" : "unread"}`}
                  >
                    <div>
                      <h3>{n.title}</h3>
                      <p>{n.message}</p>
                      <small>{n.created_at}</small>
                    </div>

                    {!n.is_read && (
                      <button
                        onClick={async () => {
                          try {
                            await request(`/notifications/${n.id}/read`, {
                              method: "PATCH"
                            });
                            setNotifications(prev =>
                              prev.map(item =>
                                item.id === n.id
                                  ? { ...item, is_read: 1 }
                                  : item
                              )
                            );
                            setUnreadCount(count => Math.max(0, count - 1));
                          } catch (err) {
                            setError(err.message);
                          }
                        }}
                      >
                        Mark as read
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
        {page === "how-it-works" && (
          <section className="content-section info-page">
            <span className="eyebrow">SIMPLE. LOCAL. SHARED.</span>
            <h1>How BorrowBox works</h1>
            <div className="info-grid">
              <InfoCard number="01" title="Discover" text="Find useful items shared by people in your community." />
              <InfoCard number="02" title="Request" text="Choose your dates and send a borrowing request." />
              <InfoCard number="03" title="Borrow" text="Coordinate pickup with the owner and enjoy your item." />
              <InfoCard number="04" title="Return" text="Return the item and help keep sharing going." />
            </div>
          </section>
        )}

        {page === "community" && (
          <section className="content-section info-page">
            <span className="eyebrow">SHARE MORE. WASTE LESS.</span>
            <h1>Community comes first.</h1>
            <p className="page-description">
              BorrowBox helps neighbours share useful things,
              reduce waste and build stronger local connections.
            </p>
            <button
              className="primary-btn"
              onClick={() => navigate("explore")}
            >
              Explore the community <ArrowRight size={17} />
            </button>
          </section>
        )}
      </main>

      {showForm && (
        <div className="modal-backdrop">
          <form className="item-form" onSubmit={addItem}>
            <button
              type="button"
              className="close-btn"
              onClick={() => setShowForm(false)}
            >
              <X />
            </button>

            <span className="eyebrow">SHARE SOMETHING USEFUL</span>
            <h2>List an item</h2>

            <input
              placeholder="Item title"
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              required
            />

            <textarea
              placeholder="Describe your item..."
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              required
            />

            <select
              value={form.category_id}
              onChange={e => setForm({ ...form, category_id: e.target.value })}
              required
            >
              <option value="">Choose category</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            <input
              type="number"
              min="1"
              placeholder="Price per day (₹)"
              value={form.price_per_day}
              onChange={e => setForm({ ...form, price_per_day: e.target.value })}
              required
            />

            <input
              placeholder="Pickup area (not exact address)"
              value={form.location}
              onChange={e => setForm({ ...form, location: e.target.value })}
              required
            />

            <button className="primary-btn">Publish listing</button>
          </form>
        </div>
      )}

      <footer className="site-footer">
        <div>
          <div className="footer-brand">
            <span className="brand-mark">B</span>
            <b>BorrowBox</b>
          </div>
          <p>Own less. Live more.</p>
        </div>

        <div className="footer-note">
          Exact addresses and phone numbers are never displayed publicly.
          Pickup spots are approximate and arranged in-app.
        </div>

        <button className="footer-logout" onClick={logout}>
          <LogOut size={15} /> Logout
        </button>
      </footer>
    </div>
  );
}

function Stat({ icon, label, value }) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}


function CategoryGrid({ categories, onSelect }) {
  const categoryConfig = [
    {
      match: ["tool", "diy"],
      label: "Tools & DIY",
      icon: Wrench
    },
    {
      match: ["electronic"],
      label: "Electronics",
      icon: Package
    },
    {
      match: ["book", "study"],
      label: "Books & Study",
      icon: BookOpen
    },
    {
      match: ["sport", "fitness"],
      label: "Sports & Fitness",
      icon: Dumbbell
    },
    {
      match: ["travel", "camp"],
      label: "Travel & Camping",
      icon: Tent
    },
    {
      match: ["kitchen", "home", "furniture"],
      label: "Kitchen & Home",
      icon: Home
    },
    {
      match: ["music", "photo"],
      label: "Music & Photography",
      icon: Camera
    },
    {
      match: ["other"],
      label: "Other Essentials",
      icon: Sparkles
    }
  ];

  const sortedCategories = [...categories].sort((a, b) => {
    const getOrder = (name) => {
      const index = categoryConfig.findIndex(config =>
        config.match.some(word => name.toLowerCase().includes(word))
      );
      return index === -1 ? 99 : index;
    };

    return getOrder(a.name) - getOrder(b.name);
  });

  return (
    <div className="category-grid">
      {sortedCategories.map((category) => {
        const config = categoryConfig.find(config =>
          config.match.some(word =>
            category.name.toLowerCase().includes(word)
          )
        );

        const Icon = config?.icon || Sparkles;
        const label = config?.label || category.name;

        return (
          <button
            className="category-card"
            key={category.id}
            onClick={() => onSelect(category.name)}
          >
            <span className="category-icon">
              <Icon size={27} strokeWidth={2} />
            </span>

            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}


function ItemGrid({ items, onBook, own = false, favorites = [], onFavorite }) {
  if (!items.length) {
    return (
      <div className="empty-state">
        <Package size={34} />
        <h3>No items found</h3>
        <p>Try another search or list the first item.</p>
      </div>
    );
  }

  return (
    <div className="item-grid">
      {items.map(item => (
        <article className="item-card" key={item.id}>
          <div className="item-art">
            <div className="item-art-icon"><Package size={43} /></div>
            <span className="available-badge">Available</span>

            {!own && (
              <button
                className={`favorite-btn ${favorites.includes(item.id) ? "favorited" : ""}`}
                onClick={() => onFavorite?.(item.id)}
                title="Add to favourites"
              >
                <Heart size={18} fill={favorites.includes(item.id) ? "currentColor" : "none"} />
              </button>
            )}
          </div>

          <div className="item-details">
            <span className="eyebrow">{item.category_name || "Community item"}</span>
            <h3>{item.title}</h3>
            <p>{item.description}</p>

            <div className="item-meta">
              <span><MapPin size={14} /> {item.location}</span>
              <b><IndianRupee size={14} />{item.price_per_day}/day</b>
            </div>

            {!own && (
              <button className="primary-btn" onClick={() => onBook(item.id)}>
                Request to borrow <ArrowRight size={16} />
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}


function BookingRow({ booking, reviewForm, onSubmitReview }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const verificationData = JSON.parse(
    localStorage.getItem("borrowbox_demo_verification") || "{}"
  );

  const verification = verificationData[booking.id];

  const isReturned =
    booking.status === "completed";

  return (
    <div className="booking-row">
      <div>
        <b>{booking.item_title}</b>
        <p>{booking.start_date} to {booking.end_date}</p>

        {verification && (
          <div className="verification-info">
            <span>
              ID Proof: {verification.idType}
            </span>

            <span className={`verification-badge ${isReturned ? "released" : "active"}`}>
              {isReturned
                ? "Verification Released"
                : "ID Verification Active (Demo)"}
            </span>
          </div>
        )}
      </div>

      <span className={`status ${booking.status}`}>
        {booking.status}
      </span>
      {booking.status === "completed" && !reviewForm?.submitted && (
  <div className="review-form">
    <h4>Rate your experience</h4>

    <select
      value={rating}
      onChange={e => setRating(Number(e.target.value))}
    >
      <option value={5}>⭐⭐⭐⭐⭐ - Excellent</option>
      <option value={4}>⭐⭐⭐⭐ - Very Good</option>
      <option value={3}>⭐⭐⭐ - Good</option>
      <option value={2}>⭐⭐ - Fair</option>
      <option value={1}>⭐ - Poor</option>
    </select>

    <textarea
      placeholder="Write your review..."
      value={comment}
      onChange={e => setComment(e.target.value)}
    />

    <button
      onClick={() => {
        if (!comment.trim()) {
          alert("Please write a comment.");
          return;
        }

        onSubmitReview(booking.id, rating, comment);
      }}
    >
      Submit Review
    </button>
  </div>
)}

{reviewForm?.submitted && (
  <p className="review-success">Review submitted successfully!</p>
)}
    </div>
  );
}

function InfoCard({ number, title, text }) {
  return (
    <div className="info-card">
      <span>{number}</span>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}