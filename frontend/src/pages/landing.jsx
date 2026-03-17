import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconButton, Button } from '@mui/material';
import RestoreIcon from '@mui/icons-material/Restore';
import PersonIcon from '@mui/icons-material/Person';

function LandingPage() {
    const router = useNavigate();
    const token = localStorage.getItem("token");
    const handleGetStarted =() => {
        if(token) {
            router("/home");
        } else {
            router("/auth");
        }
    }
     let navigate = useNavigate();
    return ( 
        <div className='landingPageContainer'>
            <nav>
                <div className="navHeader">
                    <h2>ConferenceWorld</h2>
                </div>
                {!token ? <div className="navList">
                    <p onClick={() => {
                        router("/guest_join")
                    }}>Join as guest</p>
                    <p onClick={() => {
                        router("/auth")
                    }}>Register</p>
                    <div role='button'>
                        <p onClick={() => {
                            router("/auth")
                        }}>Login</p>
                    </div>
                </div> : <div style={{display: "flex", alignItems: "center", gap: "10px"}}>
                    <Button 
                        startIcon={<RestoreIcon />} 
                        onClick={() => navigate("/history")}
                        sx={{ color: "var(--text-primary)", textTransform: "none", fontSize: "1rem" }}
                    >
                        History
                    </Button>
                    <Button 
                        onClick={() => {
                            localStorage.removeItem("token")
                            navigate("/auth")
                        }} 
                        sx={{ color: "var(--text-primary)", textTransform: "none", fontSize: "1rem" }}
                    >
                        Logout
                    </Button>
                    <Button className="profile-btn" onClick={() => navigate("/Profile")}>
                        <PersonIcon className="profile"/>        
                    </Button>
                </div>}
                
            </nav>
            <div className="landingMainContainer">
                <div>
                    <h1><span style={{color: "#ff9839"}}>Connect</span> with your loved ones</h1>
                    <p>Cover a distance with ConferenceWorld</p>
                    <div role='button' onClick={handleGetStarted}>
                        <p style={{cursor: 'pointer'}}>Get Started</p>
                    </div>
                </div>
                <div>
                    <img src="mobile.png" alt="" />
                </div>
            </div>
        </div>
     );
}

export default LandingPage;